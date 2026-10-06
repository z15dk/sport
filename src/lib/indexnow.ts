import { DIVISIONS, clubByName } from '../data/leagues'
import { getMatches } from '../data/matches'
import 'server-only'
import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { SITE_URL, paths } from './site'
import { indexable } from './settings'
import { cacheDir } from './tsdb'
import { isoDate } from './time'
import { allArticles } from './articles'

// IndexNow tells Bing, Yandex and others (and through Bing, ChatGPT and Copilot)
// right away when a page changes: a match of any sport finishes, or an article is
// published or edited. Only active when the site is indexable (/admin/indstillinger
// or SITE_INDEXABLE); the key (INDEXNOW_KEY, or one made once) is served at /indexnow.txt.
// What was sent last is kept in data/indexnow-state.json, so a restart neither
// repeats nor skips anything, and /admin/indstillinger can show it.

const VALID_KEY = /^[a-zA-Z0-9-]{8,128}$/
const keyFile = () => path.join(/*turbopackIgnore: true*/ cacheDir(), 'data', 'indexnow-key.txt')
let key: string | undefined

/** INDEXNOW_KEY from the server, else one made once and kept in the data folder */
export function indexNowKey(): string {
  if (key) return key
  const env = process.env.INDEXNOW_KEY?.trim()
  if (env && VALID_KEY.test(env)) return (key = env)
  try {
    const saved = readFileSync(keyFile(), 'utf8').trim()
    if (VALID_KEY.test(saved)) return (key = saved)
  } catch {
    // not made yet
  }
  key = randomBytes(16).toString('hex')
  try {
    mkdirSync(path.dirname(keyFile()), { recursive: true })
    writeFileSync(keyFile(), key)
  } catch {
    // read-only disk: the key lasts until the next restart
  }
  return key
}
const INTERVAL_MS = 10 * 60_000
const DAY_MS = 24 * 60 * 60_000
/** How far back a run looks after the server has been down */
const CATCH_UP_MS = 6 * 60 * 60_000

export const indexNowEnabled = () => indexable()

interface State {
  /** The main pages have been sent since indexing was switched on */
  announced?: boolean
  /** When articles were last looked through */
  last?: number
  /** Finished matches already sent (today's and yesterday's) */
  done?: string[]
  /** The last answer from IndexNow */
  sent?: { at: number; count: number; status: number }
}

const stateFile = () => path.join(/*turbopackIgnore: true*/ cacheDir(), 'data', 'indexnow-state.json')

function readState(): State {
  try {
    return JSON.parse(readFileSync(stateFile(), 'utf8')) as State
  } catch {
    return {}
  }
}

function writeState(state: State) {
  try {
    mkdirSync(path.dirname(stateFile()), { recursive: true })
    writeFileSync(`${stateFile()}.tmp`, JSON.stringify(state))
    renameSync(`${stateFile()}.tmp`, stateFile())
  } catch {
    // read-only disk: the next run starts over
  }
}

/** The last answer from IndexNow: when, how many addresses and the HTTP status (200 and 202 are fine) */
export const indexNowStatus = () => readState().sent

/** Sends the addresses; the HTTP status, or undefined when IndexNow could not be reached */
async function submit(paths: string[]): Promise<{ count: number; status?: number }> {
  const host = new URL(SITE_URL).host
  const urlList = [...new Set(paths)].map((p) => `${SITE_URL}${p}`)
  try {
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host, key: indexNowKey(), keyLocation: `${SITE_URL}/indexnow.txt`, urlList }),
    })
    console.log(`[indexnow] ${urlList.length} adresser sendt (${res.status})`)
    return { count: urlList.length, status: res.status }
  } catch (err) {
    console.warn('[indexnow] kunne ikke sende', err)
    return { count: urlList.length }
  }
}

// ---------------------------------------------------------------- the "Index Now" button

export interface IndexNowSend {
  at: number
  count: number
  status?: number
  paths: string[]
}

const logFile = () => path.join(/*turbopackIgnore: true*/ cacheDir(), 'data', 'indexnow-log.json')

/** The last sends by hand ("Index Now"), newest first */
export function indexNowLog(): IndexNowSend[] {
  try {
    return JSON.parse(readFileSync(logFile(), 'utf8')) as IndexNowSend[]
  } catch {
    return []
  }
}

/** Our own page from an address or a path ("https://matchly.dk/klub/x" or "/klub/x"); not admin or API pages */
function ownPath(input: string): string | undefined {
  let p = input.trim()
  if (!p) return undefined
  if (/^https?:\/\//i.test(p)) {
    try {
      const u = new URL(p)
      if (u.host.replace(/^www\./, '') !== new URL(SITE_URL).host.replace(/^www\./, '')) return undefined
      p = u.pathname + u.search
    } catch {
      return undefined
    }
  }
  if (!p.startsWith('/') || p.startsWith('//') || /^\/(admin|api)(\/|$)/.test(p)) return undefined
  return p
}

/**
 * "Index Now" as in Rank Math: tells Bing, Yandex and the other IndexNow engines (and through Bing,
 * Copilot and ChatGPT search) about these pages right away. Google does not take part in IndexNow.
 */
export async function indexNowByHand(inputs: string[]): Promise<{ count?: number; status?: number; skipped?: number; error?: string }> {
  if (!indexNowEnabled()) return { error: 'Siden er ikke synlig for søgemaskiner – slå det til under Søgemaskiner først' }
  const paths = [...new Set(inputs.map(ownPath).filter((p): p is string => !!p))].slice(0, 100)
  if (!paths.length) return { error: 'Ingen gyldige adresser på matchly.dk' }
  const { count, status } = await submit(paths)
  const entry: IndexNowSend = { at: Date.now(), count, status, paths: paths.slice(0, 20) }
  try {
    mkdirSync(path.dirname(logFile()), { recursive: true })
    writeFileSync(`${logFile()}.tmp`, JSON.stringify([entry, ...indexNowLog()].slice(0, 30)))
    renameSync(`${logFile()}.tmp`, logFile())
  } catch {
    // the log is a nicety; the send happened
  }
  if (!status) return { error: 'IndexNow kunne ikke nås – prøv igen om lidt' }
  if (status !== 200 && status !== 202) return { count, status, error: `IndexNow svarede ${status}` }
  return { count, status, skipped: inputs.filter((x) => x.trim()).length - paths.length }
}

/** Today's and yesterday's finished matches, every sport (a late match ends after midnight) */
function finishedMatches(now: number) {
  const bySlug = new Map<string, ReturnType<typeof getMatches>[number]>()
  for (const day of [isoDate(now - DAY_MS), isoDate(now)]) {
    for (const m of getMatches(day, 'all', now)) if (m.state === 'finished') bySlug.set(m.slug, m)
  }
  return [...bySlug.values()]
}

/** The pages a finished match changes: its own, the front page, the league with its results, and both clubs */
function matchPages(m: ReturnType<typeof getMatches>[number]) {
  const out = [paths.match(m.slug), '/']
  if (m.leagueSlug) out.push(paths.league(m.leagueSlug), `${paths.league(m.leagueSlug)}/resultater`)
  for (const t of [m.home.name, m.away.name]) {
    const club = clubByName(t)
    if (club) out.push(paths.club(club.club.slug))
  }
  return out
}

/** Articles that went live (also scheduled ones) or were edited in the given window, with the lists they stand on */
function changedArticles(from: number, to: number) {
  const out: string[] = []
  for (const a of allArticles()) {
    const published = a.publishedAt ? Date.parse(a.publishedAt) : NaN
    if (a.status !== 'published' || !(published <= to)) continue
    const changed = Math.max(published, Date.parse(a.updatedAt) || 0)
    if (changed <= from) continue
    out.push(paths.article(a.slug), paths.articles())
    if (a.category) out.push(paths.articleCategory(a.category))
  }
  return out
}

let started = false
export function startIndexNow() {
  if (started) return
  started = true
  // Checked every run, so switching indexing on in the admin pages starts it without a restart.
  // The first run while indexable sends the main pages; later runs whatever changed since the last one.
  let running = false
  const run = async () => {
    if (running) return
    running = true
    try {
      const now = Date.now()
      const state = readState()
      if (!indexNowEnabled()) {
        if (state.announced) writeState({ ...state, announced: false })
        return
      }
      const finished = finishedMatches(now)
      // Without a list (the first run ever) the matches already played count as sent
      const done = new Set(state.done ?? finished.map((m) => m.slug))
      const fresh = finished.filter((m) => !done.has(m.slug))
      const from = Math.max(state.last ?? now, now - CATCH_UP_MS)
      const list = [
        ...(state.announced ? [] : ['/', paths.clubs(), paths.about(), paths.articles(), ...DIVISIONS.map((d) => paths.league(d.slug))]),
        ...fresh.flatMap(matchPages),
        ...changedArticles(from, now),
      ]
      const keep = { ...state, done: finished.filter((m) => done.has(m.slug)).map((m) => m.slug) }
      if (!list.length) return writeState({ ...keep, announced: true, last: now })
      const { count, status } = await submit(list)
      const sent = status ? { at: now, count, status } : state.sent
      // Refused or unreachable: the same pages are tried again at the next run
      if (status !== 200 && status !== 202) return writeState({ ...keep, sent })
      writeState({ announced: true, last: now, done: finished.map((m) => m.slug), sent })
    } catch (err) {
      console.warn('[indexnow] kørslen fejlede', err)
    } finally {
      running = false
    }
  }
  setTimeout(() => void run(), 60_000).unref()
  setInterval(() => void run(), INTERVAL_MS).unref()
}
