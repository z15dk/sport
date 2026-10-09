import 'server-only'
import { clubNames } from '../data/aliases'
import { findClub } from '../data/matchInsights'
import { NEW_CLUB_PAGE_DIVISIONS } from '../data/nyKlubside'
import { apiLeagueIdOf, apiTeamIdOf, apiTeamStadium } from './apisports'
import { dbuMatchGround } from './channels'
import { knownGround } from './rettelser'

/**
 * The ground a home match is played at, for the data search engines read (the match's place, the club's FAQ): by DBU's
 * name where DBU's match programme has the day ("Brøndby Stadion"), else the stadium API-Sports names for the home
 * team's league matches ("Emirates Stadium"). Only for the leagues with the new club page, and only for our own clubs;
 * nothing otherwise (the match's own venue, often just the town, is used then).
 */
export function homeGround(home: string, kickoff: Date): string | undefined {
  const found = findClub(home)
  if (!found || !NEW_CLUB_PAGE_DIVISIONS.has(found.division.id)) return undefined
  // A ground set by hand or by James (the datavagt) wins
  const fixed = knownGround(found.club.slug)
  if (fixed) return fixed.name
  const names = clubNames(found.club)
  const dbu = dbuMatchGround(names, kickoff)
  if (dbu) return dbu
  const league = apiLeagueIdOf(found.division.id)
  const team = league ? apiTeamIdOf(league, names) : undefined
  return league && team ? apiTeamStadium(league, team) : undefined
}
