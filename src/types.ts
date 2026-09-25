export type SportId = 'soccer' | 'basketball' | 'ice_hockey' | 'handball' | 'volleyball' | 'american_football' | 'tennis'

export type MatchState = 'upcoming' | 'live' | 'finished' | 'postponed'

export interface Team {
  name: string
  badge?: string
  score?: number
  /** [background, text] for the fallback badge */
  colors?: [string, string]
}

/** Something that happened in a match: a goal or a card */
export interface Incident {
  minute: number
  side: 'home' | 'away'
  kind: 'goal' | 'penalty' | 'own-goal' | 'yellow' | 'red'
  player?: string
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
  /** Round number within the competition */
  round?: number
  /** Set once finished; cup ties level after full time are decided on penalties */
  winner?: 'home' | 'away' | 'draw'
  /** Real fixture and result (TheSportsDB) rather than a fictional one */
  real?: boolean
  /** Goals and cards, in match order, when a source has them */
  incidents?: Incident[]
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
