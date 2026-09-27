// A player's page (/spiller/<id>-<name>): API-Sports' profile, the season per
// competition, transfers and trophies (src/lib/apisports.ts, apiPlayer).

import { slugify } from '../lib/slug'

export interface PlayerSeasonRow {
  team: string
  teamId?: number
  teamLogo?: string
  league: string
  leagueId?: number
  leagueLogo?: string
  country?: string
  season: number
  games: number
  lineups?: number
  minutes?: number
  number?: number
  position?: string
  rating?: number
  captain?: boolean
  goals: number
  assists: number
  conceded?: number
  saves?: number
  shots?: number
  shotsOn?: number
  passes?: number
  keyPasses?: number
  passAccuracy?: number
  tackles?: number
  interceptions?: number
  duels?: number
  duelsWon?: number
  dribbles?: number
  dribblesWon?: number
  foulsDrawn?: number
  foulsCommitted?: number
  yellow: number
  red: number
  penScored?: number
  penMissed?: number
}

export interface PlayerTransfer {
  date: string
  type?: string
  from: string
  fromLogo?: string
  to: string
  toLogo?: string
}

export interface PlayerTrophy {
  league: string
  country?: string
  season: string
  place: string
}

export interface PlayerData {
  id: number
  name: string
  firstname?: string
  lastname?: string
  age?: number
  birthDate?: string
  birthPlace?: string
  birthCountry?: string
  nationality?: string
  height?: string
  weight?: string
  injured?: boolean
  photo?: string
  /** This season and the one before, per competition */
  seasons: PlayerSeasonRow[]
  transfers: PlayerTransfer[]
  trophies: PlayerTrophy[]
}

export const playerPath = (id: number | string, name: string) => `/spiller/${id}-${slugify(name) || 'spiller'}`
