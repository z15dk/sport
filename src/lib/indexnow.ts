import { DIVISIONS, clubByName } from '../data/leagues'
import { getMatches } from '../data/matches'
import { INDEXABLE, SITE_URL, paths } from './site'
import { isoDate } from './time'

// IndexNow tells Bing, Yandex and others (and through Bing, ChatGPT and Copilot)
// right away when a page changes. Only active when the site is indexable and
// INDEXNOW_KEY is set; the key is served at /indexnow.txt.

export const INDEXNOW_KEY = process.env.INDEXNOW_KEY ?? ''
const INTERVAL_MS = 10 * 60_000
const FULL_TIME_MS = 110 * 60_000

export const indexNowEnabled = () => INDEXABLE && /^[a-zA-Z0-9-]{8,128}$/.test(INDEXNOW_KEY)

async function submit(paths: string[]) {
  if (!paths.length) return
  const host = new URL(SITE_URL).host
  const urlList = [...new Set(paths)].map((p) => `${SITE_URL}${p}`)
  try {
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host, key: INDEXNOW_KEY, keyLocation: `${SITE_URL}/indexnow.txt`, urlList }),
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

export function startIndexNow() {
  if (!indexNowEnabled()) return
  // On start: the main pages; afterwards: whatever changed since the last run
  void submit(['/', paths.clubs(), paths.about(), ...DIVISIONS.map((d) => paths.league(d.slug))])
  let last = Date.now()
  setInterval(() => {
    const now = Date.now()
    void submit(changedSince(last, now))
    last = now
  }, INTERVAL_MS).unref()
}
