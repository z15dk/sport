import type { SportFilter, SportId } from './types'

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
  { id: 'volleyball', slug: 'volleyball', label: 'Volleyball', apiName: 'Volleyball' },
  { id: 'american_football', slug: 'amerikansk-fodbold', label: 'Am. fodbold', apiName: 'American Football' },
]

/** Every sport at once: the front page's default */
export const ALL_SPORTS = { id: 'all' as const, slug: 'alle', label: 'Alle sportsgrene' }

/** The sport in the URL (?sport=...), or every sport when there is none */
export const sportFilterBySlug = (slug?: string): { id: SportFilter; slug: string; label: string } =>
  SPORTS.find((s) => s.slug === slug) ?? ALL_SPORTS
export const sportById = (id: SportId) => SPORTS.find((s) => s.id === id)!
