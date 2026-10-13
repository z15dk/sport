import type { Match } from '../types'
import { isWomenMatch } from '../data/matches'
import { mainLeagueKey } from '../data/baselines'
import { seasonClub } from '../data/season'

// The Danish football matches James writes about (a preview before, a report after – the owner's word 10/10-2026):
// the Superliga, 1., 2. and 3. division, the A-Liga, the DBU Pokal, and Denmark's men's and women's national teams.
// Youth and other women's leagues are not in it. Since week 42 also the Superliga clubs' matches in Europe (Champions
// League, Europa League, Conference League incl. qualifying), which Danes search for most of all.

const DIVISIONS = new Set(['superliga', '1-division', '2-division', '3-division'])
const A_LIGA = 'x-denmark-a-liga'
/** UEFA's three club tournaments (not the women's or youth editions) */
const EUROPE = /\b(champions league|europa league|conference league)\b/i
/** The national teams under the names we show */
const NATIONAL = /^danmark( \(k\))?$/i

export type DanishCompetition = 'superliga' | '1-division' | '2-division' | '3-division' | 'a-liga' | 'pokalen' | 'landshold' | 'europa'

/** Which of James' Danish competitions a match is in, if any */
export function danishCompetition(m: Pick<Match, 'leagueSlug' | 'league' | 'country' | 'home' | 'away'>): DanishCompetition | undefined {
  const slug = m.leagueSlug ?? ''
  if (DIVISIONS.has(slug)) return isWomenMatch(m as Match) ? undefined : (slug as DanishCompetition)
  if (slug && mainLeagueKey(slug) === A_LIGA) return 'a-liga'
  if (/pokal|dbu cup|danish cup/i.test(m.league) && /^(denmark|danmark)?$/i.test(m.country ?? '') && !isWomenMatch(m as Match)) return 'pokalen'
  if (NATIONAL.test(m.home.name) || NATIONAL.test(m.away.name)) return 'landshold'
  if (EUROPE.test(m.league) && !/women|kvinde|youth|u19/i.test(m.league) && !isWomenMatch(m as Match) && [m.home.name, m.away.name].some((n) => seasonClub(n)?.division.slug === 'superliga'))
    return 'europa'
  return undefined
}

/** Whether a match is one James writes a preview and a report for */
export const isDanishFootball = (m: Pick<Match, 'leagueSlug' | 'league' | 'country' | 'home' | 'away'>) => danishCompetition(m) !== undefined
