import type { Match } from '../types'
import { isWomenMatch } from '../data/matches'
import { mainLeagueKey } from '../data/baselines'

// The Danish football matches James writes about (a preview before, a report after – the owner's word 10/10-2026):
// the Superliga, 1., 2. and 3. division, the A-Liga, the DBU Pokal, and Denmark's men's and women's national teams.
// Youth and other women's leagues are not in it.

const DIVISIONS = new Set(['superliga', '1-division', '2-division', '3-division'])
const A_LIGA = 'x-denmark-a-liga'
/** The national teams under the names we show */
const NATIONAL = /^danmark( \(k\))?$/i

export type DanishCompetition = 'superliga' | '1-division' | '2-division' | '3-division' | 'a-liga' | 'pokalen' | 'landshold'

/** Which of James' Danish competitions a match is in, if any */
export function danishCompetition(m: Pick<Match, 'leagueSlug' | 'league' | 'country' | 'home' | 'away'>): DanishCompetition | undefined {
  const slug = m.leagueSlug ?? ''
  if (DIVISIONS.has(slug)) return isWomenMatch(m as Match) ? undefined : (slug as DanishCompetition)
  if (slug && mainLeagueKey(slug) === A_LIGA) return 'a-liga'
  if (/pokal|dbu cup|danish cup/i.test(m.league) && /^(denmark|danmark)?$/i.test(m.country ?? '') && !isWomenMatch(m as Match)) return 'pokalen'
  if (NATIONAL.test(m.home.name) || NATIONAL.test(m.away.name)) return 'landshold'
  return undefined
}

/** Whether a match is one James writes a preview and a report for */
export const isDanishFootball = (m: Pick<Match, 'leagueSlug' | 'league' | 'country' | 'home' | 'away'>) => danishCompetition(m) !== undefined
