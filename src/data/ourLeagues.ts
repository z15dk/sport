import type { Division } from './club'
import type { ExternalGame } from './external'
import { DIVISIONS, sportOf } from './leagues'
import { countryKey } from './channels'

/** Our leagues by sport, country and name, so API-Sports' games in them join the same league */
const OUR_LEAGUES = new Map(
  DIVISIONS.flatMap((d, i) =>
    [d.name, d.apiLeague]
      .filter((n): n is string => !!n)
      .map((n) => [`${sportOf(d)}|${countryKey(d.country)}|${n.toLowerCase()}`, { d, i }] as const),
  ),
)

/** Our league an API-Sports game belongs to (and its place in DIVISIONS), if any */
export function divisionOfGame(g: ExternalGame): { d: Division; i: number } | undefined {
  return OUR_LEAGUES.get(`${g.sport}|${countryKey(g.league.country)}|${g.league.name.toLowerCase()}`)
}
