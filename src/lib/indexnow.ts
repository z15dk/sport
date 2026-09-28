import { DIVISIONS, clubByName } from '../data/leagues'
import { getMatches } from '../data/matches'
import 'server-only'
import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { SITE_URL, paths } from './site'
import { indexable } from './settings'
import { cacheDir } from './tsdb'
import { isoDate } from './time'

// IndexNow tells Bing, Yandex and others (and through Bing, ChatGPT and Copilot)
// right away when a page changes. Only active when the site is indexable
// (/admin/indstillinger or SITE_INDEXABLE); the key (INDEXNOW_KEY, or one made once) is served at /indexnow.txt.

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
const FULL_TIME_MS = 110 * 60_000

export const indexNowEnabled = () => indexable()

async function submit(paths: string[]) {
  if (!paths.length) return
  const host = new URL(SITE_URL).host
  const urlList = [...new Set(paths)].map((p) => `${SITE_URL}${p}`)
  try {
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host, key: indexNowKey(), keyLocation: `${SITE_URL}/indexnow.txt`, urlList }),
    })
    console.log(`[indexnow] ${urlList.length} adresser sendt (${res.status})`)
  } catch (err) {
    console.warn('[indexnow] kunne ikke sende', err)
  }
}

/** Pages that changed because a match finished in the given window */
function changedSince(from: number, to: number) {
  const out: string[] = []
  for (const m of getMatches(isoDate(to), 'soccer', to)) {
    const end = m.kickoff.getTime() + FULL_TIME_MS
    if (end <= from || end > to) continue
    out.push(paths.match(m.slug), '/')
    if (m.leagueSlug) out.push(paths.league(m.leagueSlug))
    for (const t of [m.home.name, m.away.name]) {
      const club = clubByName(t)
      if (club) out.push(paths.club(club.club.slug))
    }
  }
  return out
}

let started = false
export function startIndexNow() {
  if (started) return
  started = true
  // Checked every run, so switching indexing on in the admin pages starts it without a restart.
  // The first run while indexable sends the main pages; later runs whatever changed since the last one.
  let announced = false
  let last = Date.now()
  const run = () => {
    const now = Date.now()
    if (indexNowEnabled()) {
      if (!announced) void submit(['/', paths.clubs(), paths.about(), ...DIVISIONS.map((d) => paths.league(d.slug))])
      else void submit(changedSince(last, now))
      announced = true
    } else announced = false
    last = now
  }
  setTimeout(run, 60_000).unref()
  setInterval(run, INTERVAL_MS).unref()
}
