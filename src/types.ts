export type SportId = 'soccer' | 'basketball' | 'ice_hockey' | 'handball' | 'tennis'

export type MatchState = 'upcoming' | 'live' | 'finished' | 'postponed'

export interface Team {
  name: string
  badge?: string
  score?: number
}

export interface Match {
  id: string
  league: string
  leagueId: string
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
  league: string
  country?: string
  leagueBadge?: string
  matches: Match[]
}

export type StateFilter = 'all' | 'live' | 'finished' | 'upcoming'
