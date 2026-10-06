import 'server-only'
import { createSign } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { cacheDir } from './tsdb'
import { visitStats } from './visits'

// The growth page (/admin/vaekst): the way to 10,000 page views a day.
// - Google: Search Console read with the service account (the same key as the photo system, read-only
//   scope), kept in data/vaekst/gsc.json for six hours so the page never waits on Google more than once.
// - The site's own page views (src/lib/visits.ts).
// - The week's tasks as checklists: Claude's Monday report writes one file per task to
//   data/vaekst/opgaver/<year>-<week>[-<n>].json (never touched by the site). Steps Claude does itself
//   come marked done in the file; the admin's own ticks are kept in data/vaekst/state.json.
//   The report reads them back to follow up.

export const GOAL_PER_DAY = 10_000

const dir = () => path.join(/*turbopackIgnore: true*/ cacheDir(), 'data', 'vaekst')
const keyFile = () => process.env.GSC_KEY_FILE ?? '/opt/scoreline/google-sa.json'
const SITE = process.env.GSC_SITE ?? 'sc-domain:matchly.dk'
const CACHE_MS = 6 * 3_600_000

// ---------------------------------------------------------------- Google Search Console

export interface GscRow {
  key: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export interface GscSummary {
  fetchedAt: string
  perDay: { date: string; clicks: number; impressions: number; position: number }[]
  last7: { clicks: number; impressions: number; position: number }
  prev7: { clicks: number; impressions: number; position: number }
  topQueries: GscRow[]
  /** A search and its page shown at place 5–20: close to page 1 */
  almostPage1: GscRow[]
  /** Pages seen 10+ times without a click */
  noClicks: GscRow[]
  error?: string
}

async function token(): Promise<string> {
  const key = JSON.parse(readFileSync(keyFile(), 'utf8')) as { client_email: string; private_key: string; token_uri?: string }
  const now = Math.floor(Date.now() / 1000)
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const aud = key.token_uri ?? 'https://oauth2.googleapis.com/token'
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: key.client_email, scope: 'https://www.googleapis.com/auth/webmasters.readonly', aud, iat: now, exp: now + 3600 })}`
  const sig = createSign('RSA-SHA256').update(unsigned).sign(key.private_key).toString('base64url')
  const res = await fetch(aud, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }),
    signal: AbortSignal.timeout(20_000),
  })
  const data = (await res.json()) as { access_token?: string; error_description?: string }
  if (!data.access_token) throw new Error(`Google-login fejlede: ${data.error_description ?? res.status}`)
  return data.access_token
}

const day = (back: number) => new Date(Date.now() - back * 86_400_000).toISOString().slice(0, 10)
const short = (u: string) => u.replace(/^https?:\/\/(www\.)?matchly\.dk/, '') || '/'

async function fetchGsc(): Promise<GscSummary> {
  const auth = `Bearer ${await token()}`
  const q = async (body: object) => {
    const res = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE)}/searchAnalytics/query`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataState: 'all', ...body }),
      signal: AbortSignal.timeout(30_000),
    })
    const data = (await res.json()) as { rows?: { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }[]; error?: { message?: string } }
    if (!res.ok) throw new Error(`Search Console: ${data.error?.message ?? res.status}`)
    return data.rows ?? []
  }
  const row = (r: { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }): GscRow => ({
    key: r.keys.map(short).join(' → '),
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: Math.round(r.ctr * 1000) / 10,
    position: Math.round(r.position * 10) / 10,
  })
  const [days, queries, pages, pairs] = await Promise.all([
    q({ startDate: day(35), endDate: day(0), dimensions: ['date'] }),
    q({ startDate: day(28), endDate: day(0), dimensions: ['query'], rowLimit: 100 }),
    q({ startDate: day(28), endDate: day(0), dimensions: ['page'], rowLimit: 250 }),
    q({ startDate: day(28), endDate: day(0), dimensions: ['query', 'page'], rowLimit: 500 }),
  ])
  const perDay = days.map((r) => ({ date: r.keys[0], clicks: r.clicks, impressions: r.impressions, position: Math.round(r.position * 10) / 10 }))
  const total = (from: string, to: string) => {
    const rows = perDay.filter((r) => r.date >= from && r.date < to)
    const impressions = rows.reduce((s, r) => s + r.impressions, 0)
    return {
      clicks: rows.reduce((s, r) => s + r.clicks, 0),
      impressions,
      position: impressions ? Math.round((rows.reduce((s, r) => s + r.position * r.impressions, 0) / impressions) * 10) / 10 : 0,
    }
  }
  return {
    fetchedAt: new Date().toISOString(),
    perDay,
    last7: total(day(7), day(-1)),
    prev7: total(day(14), day(7)),
    topQueries: queries.map(row).sort((a, b) => b.impressions - a.impressions).slice(0, 15),
    almostPage1: pairs
      .map(row)
      .filter((r) => r.position >= 5 && r.position <= 20 && r.impressions >= 3)
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 12),
    noClicks: pages
      .map(row)
      .filter((r) => r.clicks === 0 && r.impressions >= 10)
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 10),
  }
}

let refreshing: Promise<void> | undefined

/** The saved Google numbers; when older than six hours they are fetched again in the background (the page shows the saved ones meanwhile) */
export function searchConsole(): GscSummary | undefined {
  const file = path.join(dir(), 'gsc.json')
  let saved: GscSummary | undefined
  try {
    saved = JSON.parse(readFileSync(file, 'utf8')) as GscSummary
  } catch {
    // not fetched yet
  }
  const age = saved ? Date.now() - Date.parse(saved.fetchedAt) : Infinity
  if (age > CACHE_MS && !refreshing && existsSync(keyFile())) {
    refreshing = fetchGsc()
      .then((s) => writeJson(file, s))
      .catch((e: unknown) => {
        // The failure is shown on the page; a folder that cannot be written to is only logged (never an unhandled rejection)
        try {
          writeJson(file, { ...(saved ?? emptyGsc()), fetchedAt: new Date().toISOString(), error: e instanceof Error ? e.message : String(e) })
        } catch (err) {
          console.warn('[vaekst] Google-tallene kunne ikke gemmes', err)
        }
      })
      .finally(() => (refreshing = undefined))
  }
  return saved
}

const emptyGsc = (): GscSummary => ({ fetchedAt: new Date(0).toISOString(), perDay: [], last7: { clicks: 0, impressions: 0, position: 0 }, prev7: { clicks: 0, impressions: 0, position: 0 }, topQueries: [], almostPage1: [], noClicks: [] })

// ---------------------------------------------------------------- the site's own page views

export function siteViews() {
  const s = visitStats(30)
  if (!s) return undefined
  const days = s.days
  const sum = (rows: typeof days) => rows.reduce((a, r) => a + r.views, 0)
  // The last seven whole days (today is still being counted)
  const last7 = sum(days.slice(-8, -1))
  const prev7 = sum(days.slice(-15, -8))
  return { days, last7, prev7, perDay: Math.round(last7 / 7), refs: s.refs }
}

// ---------------------------------------------------------------- the week's tasks

export interface GrowthTask {
  /** "2026-41" */
  id: string
  week: number
  title: string
  why: string
  goal: string
  /** The numbers measured when the task was given */
  before: string
  /** `by: 'claude'` is a step Claude does itself; `done` is when it was done (set in the file by Claude, not by the admin) */
  steps: { id: string; text: string; by?: 'claude' | 'dig'; done?: string }[]
  /** Measured by the report 2 and 4 weeks later */
  after2?: string
  after4?: string
  createdAt: string
}

interface State {
  [taskId: string]: { steps: Record<string, string>; note?: string }
}

function writeJson(file: string, value: unknown) {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(`${file}.tmp`, JSON.stringify(value, null, 2))
  renameSync(`${file}.tmp`, file)
}

const stateFile = () => path.join(dir(), 'state.json')

function readState(): State {
  try {
    return JSON.parse(readFileSync(stateFile(), 'utf8')) as State
  } catch {
    return {}
  }
}

/** Every week's task, newest first, with the admin's ticks */
export function growthTasks(): (GrowthTask & { done: Record<string, string>; complete: boolean })[] {
  const tasksDir = path.join(dir(), 'opgaver')
  let files: string[] = []
  try {
    files = readdirSync(tasksDir).filter((f) => /^\d{4}-\d{1,2}(-[a-z0-9]+)?\.json$/.test(f))
  } catch {
    return []
  }
  const state = readState()
  return files
    .map((f) => {
      try {
        return JSON.parse(readFileSync(path.join(tasksDir, f), 'utf8')) as GrowthTask
      } catch {
        return undefined
      }
    })
    .filter((t): t is GrowthTask => !!t && Array.isArray(t.steps))
    .map((t) => {
      // Ticked by the admin, or done by Claude (written in the task file)
      const done = { ...Object.fromEntries(t.steps.filter((s) => s.done).map((s) => [s.id, s.done!])), ...(state[t.id]?.steps ?? {}) }
      return { ...t, done, complete: t.steps.length > 0 && t.steps.every((s) => done[s.id]) }
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** Ticks a step of a task off (or on again) */
export function setGrowthStep(taskId: string, stepId: string, done: boolean): { error?: string } {
  const task = growthTasks().find((t) => t.id === taskId)
  if (!task || !task.steps.some((s) => s.id === stepId)) return { error: 'Opgaven findes ikke' }
  const state = readState()
  const steps = { ...(state[taskId]?.steps ?? {}) }
  if (done) steps[stepId] = new Date().toISOString()
  else delete steps[stepId]
  writeJson(stateFile(), { ...state, [taskId]: { ...state[taskId], steps } })
  return {}
}

/** When the saved Google numbers were fetched, for the page's footnote */
export const gscAge = () => {
  try {
    return statSync(path.join(dir(), 'gsc.json')).mtimeMs
  } catch {
    return undefined
  }
}
