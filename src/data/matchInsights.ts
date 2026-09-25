import type { Match } from '../types'
import type { Division } from './leagues'
import { seasonClub, standings, type StandingRow } from './season'

// Background data for the match detail view: the clubs' season from the real table.

export function findClub(name: string) {
  return seasonClub(name)
}

export interface ClubStats {
  position: number
  row: StandingRow
  division: Division
}

export function clubStats(name: string, now: number): ClubStats | undefined {
  const found = findClub(name)
  if (!found) return undefined
  const table = standings(found.division, now)
  const index = table.findIndex((r) => r.club.id === found.club.id)
  if (index < 0) return undefined
  return { position: index + 1, row: table[index], division: found.division }
}

export interface PastMatch {
  date: Date
  competition: string
  home: string
  away: string
  homeScore: number
  awayScore: number
}

/** Words for scores in each sport, for tables and comparisons */
export function scoreWords(sport: Match['sport']) {
  return sport === 'basketball'
    ? { unit: 'Point', scored: 'Point scoret', conceded: 'Point imod', perGame: 'Point pr. kamp', short: 'Score' }
    : { unit: 'Mål', scored: 'Mål scoret', conceded: 'Mål imod', perGame: 'Mål pr. kamp', short: 'Mål' }
}
