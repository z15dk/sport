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

/** A football match's statistics from API-Sports, with expected goals (theirs, or our estimate from the shots) */
export interface MatchStats {
  rows: { label: string; home: number; away: number; homeText?: string; awayText?: string }[]
  xg?: { home: number; away: number; /** API-Sports' own xG, or our estimate from the shots (see estimateXg) */ source: 'api-sports' | 'scoreline' }
}

/**
 * Expected goals estimated from shot counts, for matches the source has no xG
 * for: an average chance of scoring per shot inside the box (0.12), outside it
 * (0.03) and per penalty (0.76). Real xG looks at every shot's position and
 * kind; this only gets close over many matches, so it is shown as an estimate.
 */
export function estimateXg(insideBox: number, outsideBox: number, penalties: number): number {
  return Math.max(0, insideBox - penalties) * 0.12 + outsideBox * 0.03 + penalties * 0.76
}
