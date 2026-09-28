import 'server-only'
import type { Match } from '../types'
import { getMatches } from '../data/matches'
import { teamByName } from '../data/teams'
import { pastGame, pastGameIncidents, pastLeagueSlug, type PastGame } from './history'
import { slugify } from './slug'
import { isoDate } from './time'

// Older matches (match database and statistics bank) as a Match, for their own
// page (/kamp/<slug>) when the live data no longer has them.

/** A team the same across sources: its page in our register, else its name */
export const teamKey = (name: string) => teamByName(name)?.slug ?? slugify(name)

/** This season's match with the same teams on the same day, when the live data has it */
export function currentTwin(g: Pick<PastGame, 'date' | 'home' | 'away'>, now = Date.now()): Match | undefined {
  const home = teamKey(g.home)
  const away = teamKey(g.away)
  return getMatches(isoDate(g.date), 'all', now).find((m) => m.state !== 'upcoming' && teamKey(m.home.name) === home && teamKey(m.away.name) === away)
}

export function pastAsMatch(g: PastGame, withIncidents = true): Match {
  const colors = (name: string) => teamByName(name)?.colors ?? teamByName(name)?.season?.club.colors
  return {
    id: `past-${g.slug}`,
    slug: g.slug,
    sport: g.sport,
    league: g.tournament,
    leagueId: g.divisionId || g.tournament,
    leagueSlug: pastLeagueSlug(g),
    kickoff: g.date,
    state: 'finished',
    statusLabel: 'Slut',
    home: { name: g.home, score: g.homeScore, colors: colors(g.home) },
    away: { name: g.away, score: g.awayScore, colors: colors(g.away) },
    incidents: withIncidents ? pastGameIncidents(g) : undefined,
    real: true,
  }
}

/** The older match behind a slug, or where its page is now */
export function findPastMatch(slug: string): { game: PastGame; match: Match } | { redirect: string } | undefined {
  const game = pastGame(slug)
  if (!game) return undefined
  const twin = currentTwin(game)
  if (twin) return { redirect: twin.slug }
  return { game, match: pastAsMatch(game) }
}
