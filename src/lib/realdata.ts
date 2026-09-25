import 'server-only'
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { DIVISIONS, seasonOf } from '../data/leagues'
import { REAL_LEAGUES, getRealData, setRealData, setRealDataLoader, type RealData, type RealEvent } from '../data/real'
import { toKickoff, toScore, toState, type ApiEvent } from '../api/thesportsdb'
import { hashString } from '../data/fixtures'
import { cacheDir, tsdb } from './tsdb'

// Background job fetching real fixtures and results from TheSportsDB for the
// leagues in REAL_LEAGUES. The whole season is fetched round by round every
// six hours; rounds with matches around now are refreshed every ten minutes.
// Everything is kept in real-data.json so a restart starts with the data.

const FULL_EVERY_MS = 6 * 3_600_000
const HOT_EVERY_MS = 10 * 60_000
const MAX_ROUNDS = 40

const file = (): string => process.env.REAL_DATA_FILE ?? path.join(/*turbopackIgnore: true*/ cacheDir(), 'real-data.json')

type JobState = { running: boolean; lastFull?: number; lastHot?: number; lastError?: string; requests: number }
// On globalThis: the job (started from instrumentation) and the status page load separate copies of this module
const holder = globalThis as { __scorelineRealJob?: JobState }
const state = (holder.__scorelineRealJob ??= { running: false, requests: 0 })

// ---------------------------------------------------------------- the cache file

let readAt = 0
let fileMtime = 0

/** Reads the cache file when it has changed; checked at most every 15 seconds */
function loadFromDisk() {
  const now = Date.now()
  if (now - readAt < 15_000) return
  readAt = now
  try {
    const mtime = statSync(file()).mtimeMs
    if (mtime === fileMtime) return
    fileMtime = mtime
    setRealData(JSON.parse(readFileSync(file(), 'utf8')) as RealData)
  } catch {
    // No file yet: leagues stay fictional
  }
}

function save(data: RealData) {
  try {
    mkdirSync(path.dirname(file()), { recursive: true })
    writeFileSync(`${file()}.tmp`, JSON.stringify(data))
    renameSync(`${file()}.tmp`, file())
  } catch (err) {
    state.lastError = `Kunne ikke gemme real-data.json: ${(err as Error).message}`
  }
}

function publish(leagues: Record<string, RealEvent[]>) {
  const version = hashString(JSON.stringify(leagues)).toString(36)
  const data: RealData = { version, fetchedAt: Date.now(), leagues }
  setRealData(data)
  save(data)
}

setRealDataLoader(loadFromDisk)

// ---------------------------------------------------------------- TheSportsDB

/** 2026/27 -> 2026-2027, 2026 -> 2026 */
function apiSeason(label: string) {
  const m = /^(\d{4})\/(\d{2})$/.exec(label)
  return m ? `${m[1]}-${m[1].slice(0, 2)}${m[2]}` : label
}

function toReal(e: ApiEvent & { intRound?: string | null }): RealEvent {
  const home = toScore(e.intHomeScore)
  const away = toScore(e.intAwayScore)
  return {
    id: e.idEvent,
    round: Number(e.intRound) || 0,
    home: e.strHomeTeam,
    away: e.strAwayTeam,
    kickoff: toKickoff(e).toISOString(),
    homeScore: home,
    awayScore: away,
    state: toState(e),
    progress: e.strProgress || e.strStatus || undefined,
    venue: e.strVenue ?? undefined,
  }
}

async function fetchRound(leagueId: number, season: string, round: number): Promise<RealEvent[] | undefined> {
  const { data, error } = await tsdb<{ events: ApiEvent[] | null }>(`eventsround.php?id=${leagueId}&r=${round}&s=${season}`)
  state.requests++
  if (error) {
    state.lastError = error
    return undefined
  }
  return (data?.events ?? []).map(toReal)
}

async function fetchSeason(leagueId: number, season: string): Promise<RealEvent[] | undefined> {
  const { data, error } = await tsdb<{ events: ApiEvent[] | null }>(`eventsseason.php?id=${leagueId}&s=${season}`)
  state.requests++
  if (error) {
    state.lastError = error
    return undefined
  }
  return (data?.events ?? []).map(toReal)
}

const sortEvents = (events: RealEvent[]) => events.sort((a, b) => a.kickoff.localeCompare(b.kickoff) || a.id.localeCompare(b.id))

/** The whole season, round by round until the rounds run out */
async function fullLeague(divisionId: string, leagueId: number): Promise<RealEvent[] | undefined> {
  const division = DIVISIONS.find((d) => d.id === divisionId)
  if (!division) return undefined
  const season = apiSeason(seasonOf(division))
  const regular = (division.meetings ?? 2) * (division.clubs.length - (division.clubs.length % 2 ? 0 : 1))
  const events: RealEvent[] = []
  for (let r = 1; r <= MAX_ROUNDS; r++) {
    const round = await fetchRound(leagueId, season, r)
    if (!round) return undefined // a failed request: keep what we had
    if (round.length === 0 && r > regular) break
    events.push(...round)
  }
  // Some keys cannot look up rounds; the season list is the fallback
  if (events.length === 0) return fetchSeason(leagueId, season)
  return sortEvents(events)
}

async function runFull() {
  const leagues = { ...(getRealData()?.leagues ?? {}) }
  let changed = false
  for (const [divisionId, leagueId] of Object.entries(REAL_LEAGUES)) {
    const events = await fullLeague(divisionId, leagueId)
    if (events && events.length > 0) {
      leagues[divisionId] = events
      changed = true
    }
  }
  if (changed) publish(leagues)
  state.lastFull = Date.now()
}

/** Refetches the rounds with matches from six hours ago to three hours ahead */
async function runHot() {
  const current = getRealData()
  if (!current) return
  const now = Date.now()
  const leagues = { ...current.leagues }
  let changed = false
  for (const [divisionId, leagueId] of Object.entries(REAL_LEAGUES)) {
    const events = leagues[divisionId]
    const division = DIVISIONS.find((d) => d.id === divisionId)
    if (!events || !division) continue
    const rounds = new Set(
      events
        .filter((e) => {
          const t = Date.parse(e.kickoff)
          return t > now - 6 * 3_600_000 && t < now + 3 * 3_600_000 && e.state !== 'finished'
        })
        .map((e) => e.round),
    )
    for (const r of rounds) {
      const fresh = await fetchRound(leagueId, apiSeason(seasonOf(division)), r)
      if (!fresh || fresh.length === 0) continue
      const ids = new Set(fresh.map((e) => e.id))
      leagues[divisionId] = sortEvents([...leagues[divisionId].filter((e) => !ids.has(e.id)), ...fresh])
      changed = true
    }
  }
  if (changed) publish(leagues)
  state.lastHot = now
}

async function guarded(job: () => Promise<void>) {
  if (state.running) return
  state.running = true
  try {
    await job()
  } catch (err) {
    state.lastError = (err as Error).message
  } finally {
    state.running = false
  }
}

let started = false

/** Starts the real-data job. Called once from instrumentation.ts. */
export function startRealDataSync() {
  if (started || process.env.REAL_DATA === 'off') return
  started = true
  loadFromDisk()
  const stale = !getRealData() || Date.now() - getRealData()!.fetchedAt > FULL_EVERY_MS
  if (stale) void guarded(runFull)
  setInterval(() => void guarded(runFull), FULL_EVERY_MS).unref()
  setInterval(() => void guarded(runHot), HOT_EVERY_MS).unref()
}

/** Makes sure the latest data is loaded before a page renders */
export function loadRealData(): RealData | undefined {
  loadFromDisk()
  return getRealData()
}

/** Numbers for the status page */
export function realDataStatus() {
  const data = loadRealData()
  return {
    file: file(),
    running: state.running,
    fetchedAt: data ? new Date(data.fetchedAt).toISOString() : null,
    lastFull: state.lastFull ? new Date(state.lastFull).toISOString() : null,
    lastHot: state.lastHot ? new Date(state.lastHot).toISOString() : null,
    lastError: state.lastError ?? null,
    requests: state.requests,
    leagues: Object.keys(REAL_LEAGUES).map((id) => {
      const events = data?.leagues[id] ?? []
      return {
        id,
        name: DIVISIONS.find((d) => d.id === id)?.name ?? id,
        events: events.length,
        finished: events.filter((e) => e.state === 'finished').length,
        teams: [...new Set(events.flatMap((e) => [e.home, e.away]))].sort(),
      }
    }),
  }
}
