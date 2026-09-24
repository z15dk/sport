export type SportId = 'soccer' | 'basketball' | 'ice_hockey' | 'handball' | 'tennis'

export type MatchState = 'upcoming' | 'live' | 'finished' | 'postponed'

export interface Team {
  name: string
  badge?: string
  score?: number
  /** [background, text] for the fallback badge */
  colors?: [string, string]
}

export interface Match {
  id: string
  /** URL slug for the match page, e.g. fc-koebenhavn-broendby-if-2026-09-24 */
  slug: string
  sport: SportId
  league: string
  leagueId: string
  /** Lower sorts first when leagues are otherwise equal */
  leagueOrder?: number
  /** Set for leagues that have their own page */
  leagueSlug?: string
  country?: string
  leagueBadge?: string
  kickoff: Date
  state: MatchState
  /** Short status label, e.g. "HT", "67'", "FT" */
  statusLabel?: string
  home: Team
  away: Team
  venue?: string
}

export interface LeagueGroup {
  leagueId: string
  /** Set for leagues that have their own page */
  leagueSlug?: string
  league: string
  country?: string
  leagueBadge?: string
  matches: Match[]
}

export type StateFilter = 'all' | 'live' | 'finished' | 'upcoming'
