// The league page's deeper numbers (src/lib/leagueDeep.ts makes them on the server): where the season is – a match
// on now, the next one or a break –, the players' season from the statistics bank and who is out for the next round.

export interface LeaguePlayer {
  id: number
  name: string
  /** Our club's name */
  club: string
  photo?: string
  apps: number
  minutes: number
  goals: number
  assists: number
  rating?: number
  keyPasses: number
  saves: number
  shotsOn: number
}

export type LeagueStatus =
  | { kind: 'live'; count: number }
  | {
      kind: 'next'
      home: string
      away: string
      kickoff: string
      slug: string
      channels: string[]
      /** The next round's first and last day, when it is a round after a break */
      breakUntil?: { from: string; to: string; round?: number; international: boolean }
    }
  | { kind: 'over' }
  /** No game in the days we have, but the season is not over (an international break): no status line */
  | { kind: 'pause' }

export interface LeagueOut {
  club: string
  players: { name: string; reason: string; photo?: string; doubtful: boolean }[]
}

export interface LeagueDeep {
  status: LeagueStatus
  round: { played: number; total: number }
  players?: { rating: LeaguePlayer[]; chances: LeaguePlayer[]; saves: LeaguePlayer[]; shotsOn: LeaguePlayer[] }
  out?: LeagueOut[]
}

/** A club in the league page's boxes, from our table or a source's: the same for both kinds of league */
export interface LeagueRow {
  key: string
  name: string
  /** The club's page */
  href?: string
  logo?: string
  colors?: [string, string]
  played: number
  goalsFor: number
  goalsAgainst: number
  points: number
  /** Results in the order they were played (the last five count) */
  form: ('V' | 'U' | 'T')[]
}

/** Points in the last five matches */
export const formPoints = (form: ('V' | 'U' | 'T')[]) => form.slice(-5).reduce((t, f) => t + (f === 'V' ? 3 : f === 'U' ? 1 : 0), 0)

/** The club in the best form: the most points in the last five (once a few rounds are played) */
export const inForm = (rows: LeagueRow[]) =>
  Math.max(0, ...rows.map((r) => r.form.length)) >= 3 ? [...rows].sort((a, b) => formPoints(b.form) - formPoints(a.form) || b.points - a.points)[0] : undefined
