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
