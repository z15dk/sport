import type { SportId } from '../types'
import { slugify } from '../lib/slug'
import { DIVISIONS, type Club, type Division } from './leagues'
import { OTHER } from './matches'

// One register of every team we have data for. Each data source adds its
// teams here, and every team automatically gets a page at /klub/<slug>,
// links from match pages, a place on /klubber and in the sitemap.
// A new club in any source therefore needs no extra work.

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
  const entries: TeamEntry[] = []

  // Football leagues with a full season (Denmark, Germany, ...)
  for (const division of DIVISIONS) {
    for (const club of division.clubs) {
      entries.push({
        slug: club.slug,
        name: club.name,
        sport: 'soccer',
        league: division.name,
        leagueSlug: division.slug,
        country: division.country,
        colors: club.colors,
        season: { club, division },
      })
    }
  }

  // Other sports
  for (const [sport, leagues] of Object.entries(OTHER) as [Exclude<SportId, 'soccer'>, (typeof OTHER)[keyof typeof OTHER]][]) {
    for (const lg of leagues) {
      for (const name of lg.teams) {
        entries.push({ slug: slugify(name), name, sport, league: lg.league, country: lg.country })
      }
    }
  }

  // Keep slugs unique: a later team with a taken slug gets the sport appended
  const seen = new Set<string>()
  for (const e of entries) {
    if (seen.has(e.slug)) e.slug = `${e.slug}-${slugify(e.sport)}`
    seen.add(e.slug)
  }
  return entries
}

const TEAMS = build()
const BY_SLUG = new Map(TEAMS.map((t) => [t.slug, t]))
const BY_NAME = new Map(TEAMS.map((t) => [t.name, t]))

export const allTeams = () => TEAMS
export const teamBySlug = (slug: string) => BY_SLUG.get(slug)
export const teamByName = (name: string) => BY_NAME.get(name)
