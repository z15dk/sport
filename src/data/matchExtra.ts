// Extra facts for a match page from API-Sports (fetched on the server, cached):
// the teams' latest results and the league table.

export interface FormGame {
  /** ISO timestamp */
  date: string
  opponent: string
  home: boolean
  for: number
  against: number
  competition: string
}

export interface TableRow {
  rank: number
  teamId?: number
  name: string
  logo?: string
  played: number
  won: number
  drawn?: number
  lost: number
  for?: number
  against?: number
  points?: number
}

export interface MatchExtra {
  /** Round, stadium, referee, half-time score and the like, ready to show */
  facts: { label: string; value: string }[]
  form?: { home: FormGame[]; away: FormGame[] }
  table?: { name?: string; rows: TableRow[]; homeId?: number; awayId?: number; /** Where the table comes from */ source?: 'api-sports' | 'scoreline' }
}
