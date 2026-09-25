import { slugify } from '../lib/slug'

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
}

export interface Division {
  id: string
  slug: string
  name: string
  short: string
  country: string
  /** ISO 3166 code, for the flag */
  countryCode: 'DK' | 'DE'
  /** Friday of the first round */
  seasonStart: string
  /** Table zones: how many at the top and bottom get coloured, and what the top means */
  zones: { top: number; topLabel: string; bottom: number }
  /** Plain-language rule for promotion and relegation */
  movement: string
  /** League name at TheSportsDB (for logos) */
  apiLeague?: string
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
