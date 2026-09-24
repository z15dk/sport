import type { SportId } from './types'

export interface SportDef {
  id: SportId
  /** URL value, e.g. ?sport=ishockey */
  slug: string
  label: string
  /** Sport name used by TheSportsDB */
  apiName: string
}

export const SPORTS: SportDef[] = [
  { id: 'soccer', slug: 'fodbold', label: 'Fodbold', apiName: 'Soccer' },
  { id: 'basketball', slug: 'basketball', label: 'Basketball', apiName: 'Basketball' },
  { id: 'ice_hockey', slug: 'ishockey', label: 'Ishockey', apiName: 'Ice Hockey' },
  { id: 'handball', slug: 'haandbold', label: 'Håndbold', apiName: 'Handball' },
  { id: 'tennis', slug: 'tennis', label: 'Tennis', apiName: 'Tennis' },
]

export const sportBySlug = (slug?: string) => SPORTS.find((s) => s.slug === slug) ?? SPORTS[0]
export const sportById = (id: SportId) => SPORTS.find((s) => s.id === id)!
