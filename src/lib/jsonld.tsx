import type { Match } from '../types'
import type { Club, Division } from '../data/danishClubs'
import { SITE_NAME, SITE_URL, paths } from './site'

// schema.org structured data, read by search engines and AI assistants.

export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      // JSON.stringify output is safe apart from "<", which is escaped
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  )
}

const teamLd = (name: string, slug?: string) => ({
  '@type': 'SportsTeam',
  name,
  sport: 'Fodbold',
  ...(slug && { url: `${SITE_URL}${paths.club(slug)}` }),
})

export function matchLd(match: Match, clubSlug: (name: string) => string | undefined) {
  const status =
    match.state === 'postponed' ? 'https://schema.org/EventPostponed' : 'https://schema.org/EventScheduled'
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: `${match.home.name} – ${match.away.name}`,
    url: `${SITE_URL}${paths.match(match.slug)}`,
    startDate: match.kickoff.toISOString(),
    eventStatus: status,
    sport: match.sport === 'soccer' ? 'Fodbold' : match.sport,
    superEvent: { '@type': 'SportsEvent', name: match.league },
    homeTeam: teamLd(match.home.name, clubSlug(match.home.name)),
    awayTeam: teamLd(match.away.name, clubSlug(match.away.name)),
    competitor: [teamLd(match.home.name, clubSlug(match.home.name)), teamLd(match.away.name, clubSlug(match.away.name))],
    ...(match.venue && { location: { '@type': 'Place', name: match.venue, address: match.venue } }),
    organizer: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
  }
}

export function clubLd(club: Club, division: Division) {
  return {
    '@context': 'https://schema.org',
    ...teamLd(club.name, club.slug),
    location: { '@type': 'Place', name: club.city, address: { '@type': 'PostalAddress', addressLocality: club.city, addressCountry: 'DK' } },
    memberOf: { '@type': 'SportsOrganization', name: division.name, url: `${SITE_URL}${paths.league(division.slug)}` },
  }
}

export function leagueLd(division: Division) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsOrganization',
    name: division.name,
    sport: 'Fodbold',
    url: `${SITE_URL}${paths.league(division.slug)}`,
    member: division.clubs.map((c) => teamLd(c.name, c.slug)),
  }
}

export function breadcrumbLd(items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: `${SITE_URL}${it.path}`,
    })),
  }
}
