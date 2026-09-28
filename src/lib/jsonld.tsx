import { sizedImage } from './imageSize'
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

/** How long a match takes, for endDate (kick-off to full time with the break) */
const DURATION_MS: Partial<Record<Match['sport'], number>> = { soccer: 115 * 60_000, ice_hockey: 150 * 60_000, basketball: 120 * 60_000 }

export function matchLd(match: Match, clubSlug: (name: string) => string | undefined, description?: string) {
  const status =
    match.state === 'postponed' ? 'https://schema.org/EventPostponed' : 'https://schema.org/EventScheduled'
  const sport = sportById(match.sport).label
  const url = `${SITE_URL}${paths.match(match.slug)}`
  const league = match.leagueSlug ? `${SITE_URL}${paths.league(match.leagueSlug)}` : undefined
  const end = new Date(match.kickoff.getTime() + (DURATION_MS[match.sport] ?? 120 * 60_000))
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: `${match.home.name} – ${match.away.name}`,
    url,
    ...(description && { description }),
    // The match's own sharing picture (teams, logos, score or time)
    image: `${url}/opengraph-image`,
    startDate: match.kickoff.toISOString(),
    endDate: end.toISOString(),
    eventStatus: status,
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    sport,
    superEvent: { '@type': 'SportsEvent', name: match.league, ...(league && { url: league }) },
    homeTeam: teamLd(match.home.name, clubSlug(match.home.name), sport),
    awayTeam: teamLd(match.away.name, clubSlug(match.away.name), sport),
    competitor: [teamLd(match.home.name, clubSlug(match.home.name), sport), teamLd(match.away.name, clubSlug(match.away.name), sport)],
    // Where it is played: the stadium, or else the home team's ground
    location: {
      '@type': 'Place',
      name: match.venue ?? `${match.home.name}s hjemmebane`,
      address: { '@type': 'PostalAddress', ...(match.venue && { streetAddress: match.venue }), ...(match.country && { addressCountry: match.country }) },
    },
    // The league or tournament runs the match (not us)
    organizer: { '@type': 'SportsOrganization', name: match.league, ...(league && { url: league }) },
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

/** A picture's full address for search engines (our own pictures in 256 px) */
export const absoluteImage = (url: string) => (url.startsWith('/') ? `${SITE_URL}${sizedImage(url, 128)}` : url)

export function leagueLd(division: Division, logo?: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsOrganization',
    name: division.name,
    sport: sportById(division.sport ?? 'soccer').label,
    url: `${SITE_URL}${paths.league(division.slug)}`,
    ...(logo && { logo: absoluteImage(logo) }),
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

/** An article (NewsArticle) for search engines */
export function articleLd(a: { title: string; description: string; path: string; image?: string; publishedAt?: string; updatedAt: string; author: string; tags: string[]; section?: string }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: a.title.slice(0, 110),
    description: a.description,
    url: `${SITE_URL}${a.path}`,
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE_URL}${a.path}` },
    ...(a.image && { image: [a.image.startsWith('/') ? `${SITE_URL}${a.image}` : a.image] }),
    ...(a.publishedAt && { datePublished: a.publishedAt }),
    dateModified: a.updatedAt,
    author: a.author === SITE_NAME ? { '@type': 'Organization', name: SITE_NAME, url: SITE_URL } : { '@type': 'Person', name: a.author },
    publisher: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL, logo: { '@type': 'ImageObject', url: `${SITE_URL}/icon-512.png` } },
    ...(a.section && { articleSection: a.section }),
    ...(a.tags.length && { keywords: a.tags.join(', ') }),
    inLanguage: 'da-DK',
  }
}

/** The site itself, so Google shows "Matchly" as the site name in results */
export function websiteLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    alternateName: ['matchly.dk', 'Matchly.dk'],
    url: `${SITE_URL}/`,
    inLanguage: 'da-DK',
  }
}

export function organizationLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/icon-512.png`,
    description: 'Resultater, kampprogram, stillinger og statistik for fodbold, ishockey og basketball i Danmark, England, Tyskland, Spanien, Portugal, Sverige og Norge – live, gratis og på dansk.',
    areaServed: ['DK', 'DE', 'GB', 'ES', 'PT', 'SE', 'NO'],
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

/** A list of matches (the TV guide), each as its page and name */
export function matchListLd(name: string, matches: Match[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    numberOfItems: matches.length,
    itemListElement: matches.map((m, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${SITE_URL}${paths.match(m.slug)}`,
      name: `${m.home.name} – ${m.away.name}`,
    })),
  }
}
