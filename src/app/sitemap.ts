import type { MetadataRoute } from 'next'
import { shownDivisions } from '../data/leagues'
import { allTeams } from '../data/teams'
import { getMatches } from '../data/matches'
import { addDays, isoDate } from '../lib/time'
import { SITE_URL, paths } from '../lib/site'
import { categories, publishedArticles } from '../lib/articles'
import { loadRealData } from '../lib/realdata'
import { externalLeagueKey } from '../data/external'

export const dynamic = 'force-dynamic'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = Date.now()
  const today = isoDate(now)
  const url = (p: string) => `${SITE_URL}${p}`
  const matches = [-3, -2, -1, 0, 1, 2, 3].flatMap((d) => getMatches(addDays(today, d), 'all', now))
  // The other tournaments with a page of their own (cups, Champions League, the leagues of our partners' feed)
  const ours = new Set(shownDivisions().map((d) => d.slug))
  const tournaments = [...new Set((loadRealData()?.external ?? []).map((g) => externalLeagueKey(g.league)))].filter((k) => !ours.has(k))

  return [
    { url: url('/'), changeFrequency: 'always', priority: 1 },
    ...tournaments.map((k) => ({ url: url(paths.league(k)), changeFrequency: 'daily' as const, priority: 0.5 })),
    { url: url(paths.clubs()), changeFrequency: 'weekly', priority: 0.6 },
    ...shownDivisions().map((d) => ({ url: url(paths.league(d.slug)), changeFrequency: 'daily' as const, priority: 0.8 })),
    ...allTeams().map((t) => ({ url: url(paths.club(t.slug)), changeFrequency: 'daily' as const, priority: t.season ? 0.7 : 0.4 })),
    { url: url(paths.about()), changeFrequency: 'monthly' as const, priority: 0.3 },
    { url: url(paths.articles()), changeFrequency: 'daily' as const, priority: 0.6 },
    ...publishedArticles().articles.map((a) => ({ url: url(paths.article(a.slug)), lastModified: new Date(a.updatedAt), changeFrequency: 'weekly' as const, priority: 0.7 })),
    ...categories().map((c) => ({ url: url(paths.articleCategory(c.slug)), changeFrequency: 'weekly' as const, priority: 0.4 })),
    ...matches.map((m) => ({
      url: url(paths.match(m.slug)),
      lastModified: m.kickoff,
      changeFrequency: m.state === 'finished' ? ('monthly' as const) : ('always' as const),
      priority: 0.5,
    })),
  ]
}
