import type { SportId } from '../types'
import { sportOf, type Club, type Division } from './leagues'
import { seasonClubs } from './season'

// One register of every team playing in the leagues we show (from the real
// season). Every team automatically gets a page at /klub/<slug>, links from
// match pages, a place on /klubber and in the sitemap. Clubs missing from
// our club list (src/data/leagues.ts etc.) are included with a plain badge.

export interface TeamEntry {
  slug: string
  name: string
  sport: SportId
  league: string
  /** Set when the league has its own page */
  leagueSlug?: string
  country?: string
  colors?: [string, string]
  /** Present for clubs in the leagues we cover, which have full season data */
  season?: { club: Club; division: Division }
}

function build(): TeamEntry[] {
  return seasonClubs().map(({ club, division }) => ({
    slug: club.slug,
    name: club.name,
    sport: sportOf(division),
    league: division.name,
    leagueSlug: division.slug,
    country: division.country,
    colors: club.colors,
    season: { club, division },
  }))
}

// Rebuilt when the season changes (new real data)
let cache: { clubs: ReturnType<typeof seasonClubs>; list: TeamEntry[]; bySlug: Map<string, TeamEntry>; byName: Map<string, TeamEntry> } | undefined
function teams() {
  const clubs = seasonClubs()
  if (cache?.clubs !== clubs) {
    const list = build()
    cache = { clubs, list, bySlug: new Map(list.map((t) => [t.slug, t])), byName: new Map(list.map((t) => [t.name, t])) }
  }
  return cache
}

export const allTeams = () => teams().list
export const teamBySlug = (slug: string) => teams().bySlug.get(slug)
export const teamByName = (name: string) => teams().byName.get(name)
