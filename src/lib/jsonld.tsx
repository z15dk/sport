import type { Match } from '../types'
import type { Club, Division } from '../data/leagues'
import type { TeamEntry } from '../data/teams'
import { sportById } from '../sports'
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

const teamLd = (name: string, slug?: string, sport = 'Fodbold') => ({
  '@type': 'SportsTeam',
  name,
  sport,
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
    sport: sportById(match.sport).label,
    superEvent: { '@type': 'SportsEvent', name: match.league },
    homeTeam: teamLd(match.home.name, clubSlug(match.home.name), sportById(match.sport).label),
    awayTeam: teamLd(match.away.name, clubSlug(match.away.name), sportById(match.sport).label),
    competitor: [
      teamLd(match.home.name, clubSlug(match.home.name), sportById(match.sport).label),
      teamLd(match.away.name, clubSlug(match.away.name), sportById(match.sport).label),
    ],
    ...(match.venue && { location: { '@type': 'Place', name: match.venue, address: match.venue } }),
    organizer: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
  }
}

export function clubLd(club: Club, division: Division) {
  return {
    '@context': 'https://schema.org',
    ...teamLd(club.name, club.slug, sportById(division.sport ?? 'soccer').label),
    location: { '@type': 'Place', name: club.city, address: { '@type': 'PostalAddress', addressLocality: club.city, addressCountry: division.countryCode } },
    memberOf: { '@type': 'SportsOrganization', name: division.name, url: `${SITE_URL}${paths.league(division.slug)}` },
  }
}

export function leagueLd(division: Division, logo?: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsOrganization',
    name: division.name,
    sport: sportById(division.sport ?? 'soccer').label,
    url: `${SITE_URL}${paths.league(division.slug)}`,
    ...(logo && { logo: logo.startsWith('/') ? `${SITE_URL}${logo}` : logo }),
    member: division.clubs.map((c) => teamLd(c.name, c.slug, sportById(division.sport ?? 'soccer').label)),
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

export function faqLd(items: { q: string; a: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((it) => ({
      '@type': 'Question',
      name: it.q,
      acceptedAnswer: { '@type': 'Answer', text: it.a },
    })),
  }
}

export function webPageLd(path: string, name: string, modified: Date, description?: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    url: `${SITE_URL}${path}`,
    name,
    ...(description && { description }),
    inLanguage: 'da-DK',
    dateModified: modified.toISOString(),
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL },
    publisher: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
  }
}

export function organizationLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/favicon.svg`,
    description: 'Resultater, kampprogram, stillinger og statistik for fodbold, ishockey og basketball i Danmark, Tyskland og Sverige.',
    areaServed: ['DK', 'DE', 'SE'],
    knowsLanguage: 'da',
  }
}

export function teamPageLd(team: TeamEntry) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsTeam',
    name: team.name,
    sport: sportById(team.sport).label,
    url: `${SITE_URL}${paths.club(team.slug)}`,
    memberOf: { '@type': 'SportsOrganization', name: team.league },
    ...(team.country && { location: { '@type': 'Place', address: { '@type': 'PostalAddress', addressCountry: team.country } } }),
  }
}
