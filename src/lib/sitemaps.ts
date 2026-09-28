import 'server-only'
import { shownDivisions } from '../data/leagues'
import { allTeams } from '../data/teams'
import { getMatches } from '../data/matches'
import { allFixtures } from '../data/season'
import { getRealData } from '../data/real'
import { externalLeagueKey } from '../data/external'
import { isoDate } from './time'
import { SITE_URL, paths } from './site'
import { categories, publishedArticles } from './articles'
import { loadRealData } from './realdata'
import { pastGames } from './history'
import { teamKey } from './pastMatch'

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
  const tournaments = [...new Set((loadRealData()?.external ?? []).map((g) => externalLeagueKey(g.league)))].filter((k) => !ours.has(k))
  return [
    { path: '/' },
    ...shownDivisions().map((d) => ({ path: paths.league(d.slug) })),
    ...tournaments.map((k) => ({ path: paths.league(k) })),
    { path: paths.clubs() },
    ...allTeams().map((t) => ({ path: paths.club(t.slug) })),
    { path: paths.about() },
    { path: paths.articles() },
    ...publishedArticles().articles.map((a) => ({ path: paths.article(a.slug), lastModified: new Date(a.updatedAt) })),
    ...categories().map((c) => ({ path: paths.articleCategory(c.slug) })),
  ]
}

// Worked out once per data version and at most once an hour (it walks every match day)
let cache: { key: string; at: number; entries: SitemapEntry[] } | undefined

/** Every match page, newest first */
export function matchEntries(): SitemapEntry[] {
  const now = Date.now()
  const version = `${getRealData()?.version ?? ''}|${pastGames().length}`
  if (cache && cache.key === version && now - cache.at < 3_600_000) return cache.entries
  const days = new Set<string>()
  for (const f of allFixtures()) days.add(isoDate(f.kickoff))
  for (const g of getRealData()?.external ?? []) days.add(isoDate(new Date(g.kickoff)))
  const seen = new Set<string>()
  const entries: SitemapEntry[] = []
  const keys = new Map<string, string>()
  const key = (name: string) => keys.get(name) ?? keys.set(name, teamKey(name)).get(name)!
  const pairs = new Set<string>()
  for (const day of [...days].sort().reverse()) {
    for (const m of getMatches(day, 'all', now)) {
      if (seen.has(m.slug)) continue
      seen.add(m.slug)
      pairs.add(`${day}|${key(m.home.name)}|${key(m.away.name)}`)
      const done = m.state === 'finished'
      entries.push({ path: paths.match(m.slug), ...(done && { lastModified: new Date(m.kickoff.getTime() + FULL_TIME_MS) }) })
    }
  }
  // Older matches from the match database and the statistics bank (their own pages), unless this season's data has them
  for (const g of pastGames()) {
    if (seen.has(g.slug) || pairs.has(`${isoDate(g.date)}|${key(g.home)}|${key(g.away)}`)) continue
    seen.add(g.slug)
    entries.push({ path: paths.match(g.slug), lastModified: new Date(g.date.getTime() + FULL_TIME_MS) })
  }
  cache = { key: version, at: now, entries }
  return entries
}

export const matchFileCount = () => Math.max(1, Math.ceil(matchEntries().length / PER_FILE))
export const matchFile = (n: number) => matchEntries().slice(n * PER_FILE, (n + 1) * PER_FILE)

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function urlsetXml(entries: SitemapEntry[]): string {
  const rows = entries.map(
    (e) => `<url><loc>${escape(SITE_URL + e.path)}</loc>${e.lastModified ? `<lastmod>${e.lastModified.toISOString()}</lastmod>` : ''}</url>`,
  )
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join('\n')}\n</urlset>\n`
}

export function indexXml(files: string[]): string {
  const rows = files.map((f) => `<sitemap><loc>${escape(`${SITE_URL}/sitemaps/${f}`)}</loc></sitemap>`)
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join('\n')}\n</sitemapindex>\n`
}

export const sitemapFiles = () => ['sider.xml', ...Array.from({ length: matchFileCount() }, (_, i) => `kampe-${i + 1}.xml`)]

export const xmlResponse = (body: string) =>
  new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=900' } })
