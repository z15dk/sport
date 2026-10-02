import 'server-only'
import { LEAGUE_SUBPAGES } from '../components/LeagueSubPage'
import { rivalryPairs } from './rivalry'
import { mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { cacheDir } from './tsdb'
import { shownDivisions, sportOf } from '../data/leagues'
import { allTeams } from '../data/teams'
import { getMatches } from '../data/matches'
import { allFixtures } from '../data/season'
import { getRealData } from '../data/real'
import { externalLeagueKey } from '../data/external'
import { isoDate } from './time'
import { SITE_URL, paths } from './site'
import { categories, publishedArticles } from './articles'
import { loadRealData } from './realdata'
import { pastGameIndexable, pastGames, pastSeasons } from './history'
import { teamKey } from './pastMatch'
import { tvLeagues } from './tv'
import { divisionOfGame } from '../data/ourLeagues'
import { SPORTS } from '../sports'

// The sitemap: /sitemap.xml is an index of /sitemaps/sider.xml (front page,
// tournaments, clubs, articles) and /sitemaps/kampe-<n>.xml (every match with a
// page: the whole season in our leagues, cups, Champions League, every other
// stored game and the older matches of the match database and statistics bank), at most 40,000 addresses per file (Google's limit is 50,000).

export interface SitemapEntry {
  path: string
  lastModified?: Date
}

const PER_FILE = 40_000
const FULL_TIME_MS = 3 * 3_600_000

export function pageEntries(): SitemapEntry[] {
  const ours = new Set(shownDivisions().map((d) => d.slug))
  // The other tournaments; a game in one of our leagues ("Metal Ligaen" from another source) is that league's page, not one of its own
  const tournaments = [...new Set((loadRealData()?.external ?? []).filter((g) => !divisionOfGame(g)).map((g) => externalLeagueKey(g.league)))].filter((k) => !ours.has(k))
  return [
    { path: '/' },
    { path: '/kampe/i-gaar' },
    { path: '/kampe/i-morgen' },
    // The TV guide: today, and each league's coming matches on TV
    { path: paths.tv() },
    ...tvLeagues().map((l) => ({ path: paths.tv(l.slug) })),
    ...shownDivisions().map((d) => ({ path: paths.league(d.slug) })),
    // Head-to-heads between clubs of the same league with a few meetings (src/lib/rivalry.ts)
    ...rivalryPairs().map((r) => ({ path: r.path, lastModified: r.last })),
    // The leagues' own pages for fixture list, results and top scorers (src/components/LeagueSubPage.tsx)
    ...shownDivisions().flatMap((d) => LEAGUE_SUBPAGES.filter((p) => p !== 'topscorere' || sportOf(d) === 'soccer').map((p) => ({ path: `${paths.league(d.slug)}/${p}` }))),
    ...shownDivisions().flatMap((d) => pastSeasons(d.id).map((s) => ({ path: `${paths.league(d.slug)}/${s.slug}`, lastModified: s.games.at(-1)?.date }))),
    ...tournaments.map((k) => ({ path: paths.league(k) })),
    { path: paths.clubs() },
    ...allTeams().map((t) => ({ path: paths.club(t.slug) })),
    { path: paths.about() },
    { path: '/widget' },
    { path: paths.advertising() },
    { path: paths.privacy() },
    { path: paths.women() },
    ...SPORTS.filter((s) => s.id !== 'american_football').map((s) => ({ path: paths.women({ sport: s.slug }) })),
    { path: paths.articles() },
    ...publishedArticles().articles.map((a) => ({ path: paths.article(a.slug), lastModified: new Date(a.updatedAt) })),
    ...categories().map((c) => ({ path: paths.articleCategory(c.slug) })),
  ]
}

// Worked out once per data version and at most once an hour (it walks every match day)
// ---------------------------------------------------------------- the files, made ahead
// The sitemap's files are made in the background (after start and every hour)
// and kept in memory and on disk, so a search engine always gets its answer at
// once, also right after a restart. Working them out walks the whole season and
// every saved match: done in small steps, so the server keeps answering meanwhile.

const dir = () => process.env.SITEMAP_DIR ?? path.join(/*turbopackIgnore: true*/ cacheDir(), 'data', 'sitemaps')
const INDEX = 'sitemap.xml'
let files = new Map<string, string>()
let building: Promise<void> | undefined

/** Lets the server answer other requests between the steps */
const breather = () => new Promise<void>((r) => setImmediate(r))

/** Every match page, newest first */
async function matchEntries(): Promise<SitemapEntry[]> {
  const now = Date.now()
  const days = new Set<string>()
  for (const f of allFixtures()) days.add(isoDate(f.kickoff))
  for (const g of getRealData()?.external ?? []) days.add(isoDate(new Date(g.kickoff)))
  const seen = new Set<string>()
  const entries: SitemapEntry[] = []
  const keys = new Map<string, string>()
  const key = (name: string) => keys.get(name) ?? keys.set(name, teamKey(name)).get(name)!
  const pairs = new Set<string>()
  let step = 0
  for (const day of [...days].sort().reverse()) {
    if (++step % 10 === 0) await breather()
    for (const m of getMatches(day, 'all', now)) {
      if (seen.has(m.slug)) continue
      seen.add(m.slug)
      pairs.add(`${day}|${key(m.home.name)}|${key(m.away.name)}`)
      const done = m.state === 'finished'
      entries.push({ path: paths.match(m.slug), ...(done && { lastModified: new Date(m.kickoff.getTime() + FULL_TIME_MS) }) })
    }
  }
  await breather()
  // Older matches from the match database and the statistics bank (their own pages), unless this season's data has them
  const past = pastGames()
  for (let i = 0; i < past.length; i++) {
    if (i % 5000 === 0) await breather()
    const g = past[i]
    if (seen.has(g.slug) || pairs.has(`${isoDate(g.date)}|${key(g.home)}|${key(g.away)}`)) continue
    // Only the older matches worth a search engine's time (the big leagues, with named scorers)
    if (!pastGameIndexable(g)) continue
    seen.add(g.slug)
    entries.push({ path: paths.match(g.slug), lastModified: new Date(g.date.getTime() + FULL_TIME_MS) })
  }
  return entries
}

/** Makes every file of the sitemap and keeps them (memory and disk) */
export function buildSitemaps(): Promise<void> {
  building ??= (async () => {
    try {
      const matches = await matchEntries()
      await breather()
      const out = new Map<string, string>()
      // The pages; should one part fail, the rest of the sitemap is still made
      let pages: SitemapEntry[]
      try {
        pages = pageEntries()
      } catch {
        pages = [{ path: '/' }, { path: paths.clubs() }, { path: paths.tv() }]
      }
      out.set('sider.xml', urlsetXml(pages))
      const count = Math.max(1, Math.ceil(matches.length / PER_FILE))
      for (let i = 0; i < count; i++) out.set(`kampe-${i + 1}.xml`, urlsetXml(matches.slice(i * PER_FILE, (i + 1) * PER_FILE)))
      out.set(INDEX, indexXml([...out.keys()]))
      files = out
      try {
        mkdirSync(dir(), { recursive: true })
        for (const [name, xml] of out) {
          writeFileSync(path.join(dir(), `${name}.tmp`), xml)
          renameSync(path.join(dir(), `${name}.tmp`), path.join(dir(), name))
        }
        // Files from a bigger list before
        for (const f of readdirSync(dir())) if (/^kampe-\d+\.xml$/.test(f) && !out.has(f)) unlinkSync(path.join(dir(), f))
      } catch {
        // Kept in memory; written again next hour
      }
    } finally {
      building = undefined
    }
  })()
  return building
}

/** A file of the sitemap ("sitemap.xml", "sider.xml", "kampe-1.xml"): as made last, from memory or disk, else made now */
export async function sitemapFile(name: string): Promise<string | undefined> {
  if (!/^(sitemap|sider|kampe-\d+)\.xml$/.test(name)) return undefined
  const kept = files.get(name)
  if (kept) return kept
  try {
    return readFileSync(path.join(dir(), name), 'utf8')
  } catch {
    // Not made yet (the first start)
  }
  await buildSitemaps()
  return files.get(name)
}

/** Makes the files a minute after start, and again every hour */
export function startSitemapWarm() {
  const build = () => void buildSitemaps().catch(() => undefined)
  setTimeout(build, 60_000).unref?.()
  setInterval(build, 3_600_000).unref?.()
}

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function urlsetXml(entries: SitemapEntry[]): string {
  const rows = entries.map(
    // A date that can't be read is left out (toISOString would throw and take the whole file down)
    (e) => `<url><loc>${escape(SITE_URL + e.path)}</loc>${e.lastModified && !Number.isNaN(e.lastModified.getTime()) ? `<lastmod>${e.lastModified.toISOString()}</lastmod>` : ''}</url>`,
  )
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join('\n')}\n</urlset>\n`
}

export function indexXml(files: string[]): string {
  const rows = files.map((f) => `<sitemap><loc>${escape(`${SITE_URL}/sitemaps/${f}`)}</loc></sitemap>`)
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join('\n')}\n</sitemapindex>\n`
}


export const xmlResponse = (body: string) =>
  new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=900' } })
