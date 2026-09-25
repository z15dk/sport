// Real fixtures and results for the leagues we fetch from TheSportsDB. A
// server job (src/lib/realdata.ts) keeps them up to date; the server hands
// the same data to the browser (RealDataProvider), so both build the same
// season from it. Leagues without real data keep their fictional season.

import type { MatchState } from '../types'

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
}

export interface RealData {
  /** Changes whenever the data changes */
  version: string
  fetchedAt: number
  /** Events per division id */
  leagues: Record<string, RealEvent[]>
}

/** Divisions we fetch real data for: division id -> TheSportsDB league id */
export const REAL_LEAGUES: Record<string, number> = {
  superliga: 4340,
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
