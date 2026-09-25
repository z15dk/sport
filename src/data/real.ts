// Real fixtures and results from TheSportsDB for every league we list. A
// server job (src/lib/realdata.ts) keeps them up to date; the server hands
// the same data to the browser (RealDataProvider), so both build the same
// season from it. Leagues TheSportsDB has no fixtures for are not shown.

import type { Incident, MatchState } from '../types'
import type { ExternalGame } from './external'
import type { ChannelData } from './channels'

export interface RealEvent {
  id: string
  round: number
  home: string
  away: string
  /** ISO timestamp (UTC) */
  kickoff: string
  homeScore?: number
  awayScore?: number
  state: MatchState
  /** Minute or phase while live, e.g. "67" or "HT" */
  progress?: string
  venue?: string
  /** Goals and cards, when the source has them */
  incidents?: Incident[]
  /** Half-time score */
  ht?: [number, number]
  spectators?: number
}

export interface RealData {
  /** Changes whenever the data changes */
  version: string
  fetchedAt: number
  /** Events per division id */
  leagues: Record<string, RealEvent[]>
  /** When each division was last looked up in full (also those TheSportsDB has nothing for) */
  checked?: Record<string, number>
  /** Games from API-Sports in the days around today, all sports */
  external?: ExternalGame[]
  /** Club names changed in the admin pages, by club slug */
  clubNames?: Record<string, string>
  /** Channels, rules, exceptions and TV listings (src/data/channels.ts) */
  channels?: ChannelData
}

/** TheSportsDB league ids we know; other divisions are looked up by their `apiLeague` name */
export const KNOWN_LEAGUE_IDS: Record<string, number> = {
  superliga: 4340,
  premierleague: 4328,
  championship: 4329,
  bundesliga: 4331,
  bundesliga2: 4399,
  allsvenskan: 4347,
  eliteserien: 4358,
}

/** True when a division has real fixtures; divisions without are not shown anywhere */
export function hasRealData(divisionId: string): boolean {
  return (getRealData()?.leagues[divisionId]?.length ?? 0) > 0
}

type Holder = { __scorelineReal?: RealData; __scorelineRealLoader?: () => void }
const holder = globalThis as Holder

/** The current real data, if any. On the server it is refreshed from the job's cache file. */
export function getRealData(): RealData | undefined {
  holder.__scorelineRealLoader?.()
  return holder.__scorelineReal
}

export function setRealData(data: RealData | undefined) {
  if (data && holder.__scorelineReal?.version === data.version) return
  holder.__scorelineReal = data
}

/** Server only: registers how to refresh the data before it is read */
export function setRealDataLoader(loader: () => void) {
  holder.__scorelineRealLoader = loader
}
