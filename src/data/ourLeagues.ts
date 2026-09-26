import type { Division } from './club'
import type { ExternalGame } from './external'
import { DIVISIONS, sportOf } from './leagues'
import { countryKey } from './channels'

/** Our leagues by sport, country and name, so API-Sports' games in them join the same league */
const OUR_LEAGUES = new Map<string, { d: Division; i: number }>(
  DIVISIONS.flatMap((d, i) =>
    [d.originalName ?? d.name, d.apiLeague]
      .filter((n): n is string => !!n)
      .map((n) => [`${sportOf(d)}|${countryKey(d.country)}|${n.toLowerCase()}`, { d, i }] as const),
  ),
)

/** Other names API-Sports uses for our leagues (sponsor names come and go) */
const API_SPORTS_NAMES: Record<string, string[]> = {
  superliga: ['3F Superliga', 'Superligaen'],
  '1div': ['Betinia Liga', 'NordicBet Liga', '1st Division', '1. Division'],
  '2div': ['2nd Division', '2. Division'],
  '3div': ['3rd Division', '3. Division'],
}
for (const [id, names] of Object.entries(API_SPORTS_NAMES)) {
  const i = DIVISIONS.findIndex((d) => d.id === id)
  const d = DIVISIONS[i]
  if (d) for (const n of names) OUR_LEAGUES.set(`${sportOf(d)}|${countryKey(d.country)}|${n.toLowerCase()}`, { d, i })
}

/** Our league an API-Sports game belongs to (and its place in DIVISIONS), if any */
export function divisionOfGame(g: ExternalGame): { d: Division; i: number } | undefined {
  const prefix = `${g.sport}|${countryKey(g.league.country)}|`
  const name = g.league.name.toLowerCase()
  const exact = OUR_LEAGUES.get(prefix + name)
  if (exact) return exact
  // A sponsor in front of the name ("Campobet 2. Division"): the rest must be one of our names in full
  for (const [key, v] of OUR_LEAGUES) {
    if (!key.startsWith(prefix)) continue
    const ours = key.slice(prefix.length)
    if (name.endsWith(` ${ours}`) && !/women|kvinde|dame|u\d{2}/i.test(name)) return v
  }
  return undefined
}
