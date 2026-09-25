import type { SportId } from '../types'
import type { Club, Division } from './club'
import { playMatch, poisson } from './fixtures'

// How a fictional game ends, per sport. Stronger clubs (earlier in the league
// list) win more often. Ice hockey and basketball never end level.

export type Extra = 'ot' | 'so'

export interface GameResult {
  /** Final score, including overtime or the shootout goal */
  score: [number, number]
  /** Settled in overtime ('ot') or a shootout ('so') */
  extra?: Extra
}

function strengthDiff(div: Division, home: Club, away: Club) {
  const n = div.clubs.length
  const strength = (club: Club) => 1 - div.clubs.indexOf(club) / Math.max(1, n - 1)
  return strength(home) - strength(away)
}

/** Standard normal from the seeded generator (Box-Muller) */
function normal(rand: () => number) {
  const u = Math.max(1e-9, rand())
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand())
}

export function playGame(sport: SportId, div: Division, home: Club, away: Club, rand: () => number): GameResult {
  if (sport === 'ice_hockey') {
    const diff = strengthDiff(div, home, away)
    const h = poisson(Math.max(1.2, 3.1 + 0.9 * diff), rand)
    const a = poisson(Math.max(1.0, 2.7 - 0.9 * diff), rand)
    if (h !== a) return { score: [h, a] }
    // Level after 60 minutes: overtime, then a shootout
    const homeWins = rand() < 0.5 + diff * 0.25
    const extra: Extra = rand() < 0.55 ? 'ot' : 'so'
    return { score: homeWins ? [h + 1, a] : [h, a + 1], extra }
  }
  if (sport === 'basketball') {
    const diff = strengthDiff(div, home, away)
    let h = Math.round(82 + 9 * diff + 3 + normal(rand) * 9)
    let a = Math.round(82 - 9 * diff + normal(rand) * 9)
    let extra: Extra | undefined
    while (h === a) {
      // Overtime until someone leads
      h += 5 + Math.floor(rand() * 8)
      a += 5 + Math.floor(rand() * 8)
      extra = 'ot'
    }
    return { score: [h, a], extra }
  }
  return { score: playMatch(div, home, away, rand) }
}

/** Real minutes from start to final whistle, used for the live status */
export const GAME_LENGTH_MIN: Record<SportId, number> = {
  soccer: 110,
  ice_hockey: 100,
  basketball: 120,
  handball: 80,
  tennis: 120,
}

/** Live status text such as "67'", "2. periode" or "3. kvt." */
export function liveLabel(sport: SportId, elapsedMin: number): string {
  if (sport === 'ice_hockey') {
    // Three 20-minute periods with 18-minute breaks
    if (elapsedMin < 20) return `1. periode ${Math.floor(elapsedMin) + 1}'`
    if (elapsedMin < 38) return 'Pause'
    if (elapsedMin < 58) return `2. periode ${Math.floor(elapsedMin - 38) + 21}'`
    if (elapsedMin < 76) return 'Pause'
    return `3. periode ${Math.min(60, Math.floor(elapsedMin - 76) + 41)}'`
  }
  if (sport === 'basketball') {
    if (elapsedMin >= 55 && elapsedMin < 70) return 'Pause'
    const quarter = elapsedMin < 55 ? Math.floor(elapsedMin / 27.5) + 1 : Math.min(4, Math.floor((elapsedMin - 15) / 27.5) + 1)
    return `${quarter}. kvt.`
  }
  if (elapsedMin >= 45 && elapsedMin < 60) return 'Pause'
  return `${Math.min(elapsedMin < 45 ? Math.floor(elapsedMin) + 1 : Math.floor(elapsedMin) - 14, 90)}'`
}
