import { slugify } from '../lib/slug'
import type { SportId } from '../types'

// Shared types and helpers for the league files.

export interface Club {
  id: string
  slug: string
  name: string
  city: string
  /** [background, text] used for the fallback badge */
  colors: [string, string]
  unverified?: boolean
  /** The club's name at TheSportsDB, when it differs (used to find its logo) */
  apiName?: string
  /** The name from our club list or the data source, kept when the name is changed in the admin pages */
  originalName?: string
}

export interface Division {
  id: string
  slug: string
  name: string
  short: string
  /** Defaults to football */
  sport?: SportId
  country: string
  /** ISO 3166 code, for the flag */
  countryCode: 'DK' | 'DE' | 'SE' | 'NO' | 'GB-ENG' | 'ES' | 'PT'
  /** Shown season, e.g. "2026" for leagues played in a calendar year (default 2026/27) */
  seasonLabel?: string
  /** Day the first round starts; later rounds follow `roundStarts` */
  seasonStart: string
  /** How many times each pair meets in the regular season (default 2) */
  meetings?: number
  /** Days within each cycle, counted from the season start, on which a round is played (default [0]) */
  roundStarts?: number[]
  /** Length of the cycle that roundStarts repeats over, in days (default 7) */
  cycleDays?: number
  /** Table zones: how many at the top and bottom get coloured, and what the top means */
  zones: { top: number; topLabel: string; bottom: number }
  /** Plain-language rule for promotion and relegation */
  movement: string
  /** League name at TheSportsDB (for logos) */
  apiLeague?: string
  /** The name before it was changed in the admin pages */
  originalName?: string
  clubs: Club[]
}

export const c = (id: string, name: string, city: string, bg: string, fg = '#ffffff', unverified?: boolean): Club => ({
  id,
  slug: slugify(name),
  name,
  city,
  colors: [bg, fg],
  unverified,
})

/** Same as c() but with the name TheSportsDB uses */
export const ca = (id: string, name: string, apiName: string, city: string, bg: string, fg = '#ffffff'): Club => ({
  ...c(id, name, city, bg, fg),
  apiName,
})
