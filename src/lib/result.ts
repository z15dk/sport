import type { Match } from '../types'

export type Outcome = 'V' | 'U' | 'T'

/** Result of a finished match from one team's point of view */
export function outcomeFor(match: Match, teamName: string): Outcome | undefined {
  if (match.state !== 'finished' || !match.winner) return undefined
  if (match.winner === 'draw') return 'U'
  const isHome = match.home.name === teamName
  return (match.winner === 'home') === isHome ? 'V' : 'T'
}

export const OUTCOME_LABEL: Record<Outcome, string> = { V: 'Sejr', U: 'Uafgjort', T: 'Nederlag' }
