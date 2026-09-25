import type { SportId } from '../types'

// Sport rules shared by the real season.

/** Ice hockey / basketball games settled in overtime ('ot') or a shootout ('so') */
export type Extra = 'ot' | 'so'

/** Real minutes from start to final whistle, used to tell when a started game should be over */
export const GAME_LENGTH_MIN: Record<SportId, number> = {
  soccer: 110,
  ice_hockey: 100,
  basketball: 120,
  handball: 80,
  volleyball: 120,
  american_football: 210,
  tennis: 120,
}
