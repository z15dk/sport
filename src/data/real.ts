// Real fixtures and results from TheSportsDB for every league we list. A
// server job (src/lib/realdata.ts) keeps them up to date; the server hands
// the same data to the browser (RealDataProvider), so both build the same
// season from it. Leagues TheSportsDB has no fixtures for are not shown.

import type { Incident, MatchState, SportId } from '../types'
import type { ExternalGame } from './external'
import type { ChannelData } from './channels'
import type { SiteSettings } from './settingsDef'
import type { AdsConfig } from './ads'

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
  /** Teams in API-Sports' league tables, by league key (externalLeagueKey): pages also for teams without a game in the fetched days */
  tableTeams?: Record<string, { sport: SportId; league: string; country?: string; teams: { name: string; logo?: string }[] }>
  /** Club names changed in the admin pages, by club slug */
  clubNames?: Record<string, string>
  /** Other names for our clubs set in the admin pages (unknown teams), by club id */
  clubAliases?: Record<string, string[]>
  /** League names changed in the admin pages, by league slug (ours) or externalLeagueKey */
  leagueNames?: Record<string, string>
  /** Channels, rules, exceptions and TV listings (src/data/channels.ts) */
  channels?: ChannelData
  /** Settings from the admin pages */
  settings?: SiteSettings
  /** The ads set in /admin/reklamer (banners, ad network code) */
  ads?: AdsConfig
  /**
   * Browser only: every team name's page slug ('' when it is the name's own slug),
   * so the browser links teams without building the whole team register
   */
  teamIndex?: Record<string, string>
  /** Browser only: each club's place in its league table, by name (the browser has only part of the season) */
  positions?: Record<string, number>
  /** Browser only: team slugs by "league slug|name", for league tables */
  leagueTeamIndex?: Record<string, string>
}

/** TheSportsDB league ids we know; other divisions are looked up by their `apiLeague` name */
export const KNOWN_LEAGUE_IDS: Record<string, number> = {
  superliga: 4340,
  premierleague: 4328,
  laliga: 4335,
  ligaportugal: 4344,
  championship: 4329,
  bundesliga: 4331,
  bundesliga2: 4399,
  allsvenskan: 4347,
  eliteserien: 4358,
  // Danish leagues, ids from TheSportsDB's league pages
  '1div': 4683,
  '2div': 4632,
  '3div': 5222,
  metalligaen: 4930,
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

let lastGiven: RealData | undefined
export function setRealData(data: RealData | undefined) {
  // The same data handed over again (a component rendering once more) must not undo live changes put in since
  if (data && data === lastGiven) return
  lastGiven = data
  if (data && holder.__scorelineReal?.version === data.version) return
  holder.__scorelineReal = data
}

/**
 * Browser only: adds the games a page shows beyond the few days the browser
 * gets (a club's cup games, an older match) and their teams' links. Does
 * nothing on the server, where every game is already there.
 */
export function addRealExtras(extra: { games?: ExternalGame[]; leagues?: Record<string, RealEvent[]>; teamIndex?: Record<string, string>; leagueTeamIndex?: Record<string, string> }) {
  if (typeof window === 'undefined') return
  const cur = holder.__scorelineReal
  if (!cur) return
  const have = new Set((cur.external ?? []).map((g) => g.id))
  const games = (extra.games ?? []).filter((g) => !have.has(g.id))
  const newNames = Object.keys(extra.teamIndex ?? {}).some((k) => !(k in (cur.teamIndex ?? {})))
  const newPairs = Object.keys(extra.leagueTeamIndex ?? {}).some((k) => !(k in (cur.leagueTeamIndex ?? {})))
  // Our leagues' games the page shows beyond the browser's days (a whole season on a club's page)
  let leagues: Record<string, RealEvent[]> | undefined
  for (const [id, events] of Object.entries(extra.leagues ?? {})) {
    const had = leagues?.[id] ?? cur.leagues[id] ?? []
    const ids = new Set(had.map((e) => e.id))
    const add = events.filter((e) => !ids.has(e.id))
    if (add.length) leagues = { ...(leagues ?? cur.leagues), [id]: [...had, ...add] }
  }
  // Nothing new: keep the same objects, so what is worked out from them stays cached
  if (!games.length && !newNames && !newPairs && !leagues) return
  holder.__scorelineReal = {
    ...cur,
    external: games.length ? [...(cur.external ?? []), ...games] : cur.external,
    leagues: leagues ?? cur.leagues,
    teamIndex: newNames ? { ...cur.teamIndex, ...extra.teamIndex } : cur.teamIndex,
    leagueTeamIndex: newPairs ? { ...cur.leagueTeamIndex, ...extra.leagueTeamIndex } : cur.leagueTeamIndex,
  }
}

// Browser only: live changes put into the data without a new page (RealDataProvider, /api/live).
// Components that show matches re-render through useNow, which listens here.
const listeners = new Set<() => void>()
export function onRealDataPatch(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Browser only: the changed games replace the ones the page has (today's and live ones are added); pages then show them */
export function patchRealData(games: ExternalGame[], version: string | null) {
  if (typeof window === 'undefined') return
  const cur = holder.__scorelineReal
  if (!cur || !games.length) return
  const byId = new Map(games.map((g) => [g.id, g]))
  const external = (cur.external ?? []).map((g) => {
    const n = byId.get(g.id)
    if (n) byId.delete(g.id)
    return n ?? g
  })
  // New to the page: only what the page would have had from the server (games in play)
  for (const g of byId.values()) if (g.state === 'live') external.push(g)
  holder.__scorelineReal = { ...cur, external, version: version ?? `${cur.version}+` }
  for (const l of listeners) l()
}

/**
 * Browser only: a page that shows more than the games themselves while a match
 * is on (the match page's statistics and line-ups come from the server) asks to
 * be fetched anew now and then; RealDataProvider does so, spread out in time.
 */
let wanting = 0
export function wantPageRefresh(on: boolean) {
  wanting = Math.max(0, wanting + (on ? 1 : -1))
}
export const pageRefreshWanted = () => wanting > 0

/** Server only: registers how to refresh the data before it is read */
export function setRealDataLoader(loader: () => void) {
  holder.__scorelineRealLoader = loader
}
