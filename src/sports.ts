import type { SportId } from './types'

export interface SportDef {
  id: SportId
  label: string
  icon: string
  /** Sport name used by TheSportsDB */
  apiName: string
}

export const SPORTS: SportDef[] = [
  { id: 'soccer', label: 'Fodbold', icon: '⚽', apiName: 'Soccer' },
  { id: 'basketball', label: 'Basketball', icon: '🏀', apiName: 'Basketball' },
  { id: 'ice_hockey', label: 'Ishockey', icon: '🏒', apiName: 'Ice Hockey' },
  { id: 'handball', label: 'Håndbold', icon: '🤾', apiName: 'Handball' },
  { id: 'tennis', label: 'Tennis', icon: '🎾', apiName: 'Tennis' },
]
