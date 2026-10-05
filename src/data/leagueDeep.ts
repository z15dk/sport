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
