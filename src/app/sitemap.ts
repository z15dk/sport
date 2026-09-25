import type { MetadataRoute } from 'next'
import { DIVISIONS } from '../data/leagues'
import { allTeams } from '../data/teams'
import { getMatches } from '../data/matches'
import { addDays, isoDate } from '../lib/time'
import { SITE_URL, paths } from '../lib/site'

export const dynamic = 'force-dynamic'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = Date.now()
  const today = isoDate(now)
  const url = (p: string) => `${SITE_URL}${p}`
  const matches = [-3, -2, -1, 0, 1, 2, 3].flatMap((d) => getMatches(addDays(today, d), 'soccer', now))

  return [
    { url: url('/'), changeFrequency: 'always', priority: 1 },
    { url: url(paths.clubs()), changeFrequency: 'weekly', priority: 0.6 },
    ...DIVISIONS.map((d) => ({ url: url(paths.league(d.slug)), changeFrequency: 'daily' as const, priority: 0.8 })),
    ...allTeams().map((t) => ({ url: url(paths.club(t.slug)), changeFrequency: 'daily' as const, priority: t.season ? 0.7 : 0.4 })),
    { url: url(paths.about()), changeFrequency: 'monthly' as const, priority: 0.3 },
    ...matches.map((m) => ({
      url: url(paths.match(m.slug)),
      lastModified: m.kickoff,
      changeFrequency: m.state === 'finished' ? ('monthly' as const) : ('always' as const),
      priority: 0.5,
    })),
  ]
}
