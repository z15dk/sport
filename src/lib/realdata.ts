import 'server-only'
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { DIVISIONS, seasonOf, sportOf, type Division } from '../data/leagues'
import { normalize } from '../data/aliases'
import { KNOWN_LEAGUE_IDS, getRealData, setRealData, setRealDataLoader, type RealData, type RealEvent } from '../data/real'
import { toKickoff, toScore, toState, type ApiEvent } from '../api/thesportsdb'
import { hashString } from '../data/fixtures'
import { cacheDir, tsdb } from './tsdb'
import { databaseSeason } from './history'

// Background job fetching real fixtures and results from TheSportsDB for
// every division we list. The whole season is fetched round by round every
// six hours (about 15 minutes for all leagues on the free key); rounds with
// matches around now are refreshed every ten minutes.
// Everything is kept in real-data.json so a restart starts with the data.

const FULL_EVERY_MS = 6 * 3_600_000
const HOT_EVERY_MS = 10 * 60_000
const MAX_ROUNDS = 40

const file = (): string => process.env.REAL_DATA_FILE ?? path.join(/*turbopackIgnore: true*/ cacheDir(), 'real-data.json')

type JobState = {
  running: boolean
  lastFull?: number
  lastHot?: number
  lastError?: string
  requests: number
  missing?: string[]
  /** What each division was matched to at TheSportsDB */
  lookups?: Record<string, string>
}
// On globalThis: the job (started from instrumentation) and the pages load separate copies of this module
const holder = globalThis as { __scorelineRealJob?: JobState; __scorelineTsdb?: RealData; __scorelineMergedKey?: string }
const state = (holder.__scorelineRealJob ??= { running: false, requests: 0 })

// ---------------------------------------------------------------- the two sources

/** What TheSportsDB gave us (as saved in real-data.json) */
const base = () => holder.__scorelineTsdb

/**
 * The data pages use: TheSportsDB's leagues, plus this season from our match
 * database for the Danish divisions TheSportsDB has no fixtures for.
 */
function apply() {
  const tsdbData = base()
  const db = databaseSeason()
  const key = `${tsdbData?.version ?? '-'}|${db?.key ?? '-'}`
  if (holder.__scorelineMergedKey === key) return
  holder.__scorelineMergedKey = key
  const leagues = { ...(tsdbData?.leagues ?? {}) }
  // The source with more of the season wins (our database has the Danish divisions in full)
  for (const [id, events] of Object.entries(db?.leagues ?? {})) if (events.length > (leagues[id]?.length ?? 0)) leagues[id] = events
  if (!tsdbData && !db) return setRealData(undefined)
  setRealData({
    version: hashString(key).toString(36),
    fetchedAt: tsdbData?.fetchedAt ?? Date.now(),
    leagues,
    checked: tsdbData?.checked,
  })
}

function setBase(data: RealData) {
  holder.__scorelineTsdb = data
  apply()
}

// ---------------------------------------------------------------- the cache file

let readAt = 0
let fileMtime = 0

/** Reads the cache file (and the match database) when they have changed; checked at most every 15 seconds */
function loadFromDisk() {
  const now = Date.now()
  if (now - readAt < 15_000) return
  readAt = now
  try {
    const mtime = statSync(file()).mtimeMs
    if (mtime !== fileMtime) {
      fileMtime = mtime
      holder.__scorelineTsdb = JSON.parse(readFileSync(file(), 'utf8')) as RealData
    }
  } catch {
    // No file yet
  }
  try {
    apply()
  } catch (err) {
    state.lastError = `Kampdatabasen kunne ikke læses: ${(err as Error).message}`
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

function publish(leagues: Record<string, RealEvent[]>, checked = base()?.checked ?? {}) {
  const version = hashString(JSON.stringify(leagues)).toString(36)
  const data: RealData = { version, fetchedAt: Date.now(), leagues, checked }
  setBase(data)
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
async function fullLeague(division: Division, leagueId: number): Promise<RealEvent[] | undefined> {
  const season = apiSeason(seasonOf(division))
  const regular = (division.meetings ?? 2) * (division.clubs.length - (division.clubs.length % 2 ? 0 : 1))
  const events: RealEvent[] = []
  for (let r = 1; r <= MAX_ROUNDS; r++) {
    const round = await fetchRound(leagueId, season, r)
    if (!round) return undefined // a failed request: keep what we had
    if (round.length === 0 && r > regular) break
    // Nothing in the first rounds: the league has no rounds for this season here
    if (events.length === 0 && r >= 3) break
    events.push(...round)
  }
  // Some keys cannot look up rounds; the season list is the fallback
  if (events.length === 0) return fetchSeason(leagueId, season)
  return sortEvents(events)
}

const API_SPORT: Record<string, string> = { soccer: 'Soccer', ice_hockey: 'Ice Hockey', basketball: 'Basketball' }
const API_COUNTRY: Record<string, string> = { Danmark: 'Denmark', Tyskland: 'Germany', Sverige: 'Sweden', Norge: 'Norway', England: 'England' }
const leagueIds = new Map<string, number | null>()

/** Other names TheSportsDB may use for a division */
const LEAGUE_ALIASES: Record<string, string[]> = {
  '1div': ['Danish 1st Division', 'Danish 1. Division', 'NordicBet Liga', 'Betinia Liga'],
  '2div': ['Danish 2nd Division', 'Danish 2. Division'],
  '3div': ['Danish 3rd Division', 'Danish 3. Division'],
  liga3: ['German 3. Liga', 'German 3 Liga', '3. Liga'],
  metalligaen: ['Danish Metal Ligaen', 'Metal Ligaen', 'Danish Hockey League', 'Danish Ice Hockey League', 'Metal Ligaen Denmark'],
  shl: ['Swedish SHL', 'Swedish Hockey League', 'SHL'],
  basketligaen: ['Danish Basketligaen', 'Basketligaen', 'Danish Basketball League', 'Danish Basket Ligaen'],
}

/** TheSportsDB's id for a division: known, or found by name among the country's leagues */
async function leagueIdFor(division: Division): Promise<number | undefined> {
  if (KNOWN_LEAGUE_IDS[division.id]) return KNOWN_LEAGUE_IDS[division.id]
  if (leagueIds.has(division.id)) return leagueIds.get(division.id) ?? undefined
  const country = API_COUNTRY[division.country] ?? division.country
  const { data, error } = await tsdb<{ countries?: { idLeague: string; strLeague: string; strLeagueAlternate?: string | null }[] | null }>(
    `search_all_leagues.php?c=${encodeURIComponent(country)}&s=${encodeURIComponent(API_SPORT[sportOf(division)] ?? 'Soccer')}`,
  )
  state.requests++
  if (error) {
    state.lastError = error
    return undefined // try again next run
  }
  const wanted = [division.apiLeague, division.name, ...(LEAGUE_ALIASES[division.id] ?? [])]
    .filter((n): n is string => !!n)
    .map(normalize)
  const names = (l: { strLeague: string; strLeagueAlternate?: string | null }) =>
    [l.strLeague, ...(l.strLeagueAlternate ?? '').split(',')].map(normalize).filter(Boolean)
  const leagues = data?.countries ?? []
  // An exact name first; otherwise the shortest league whose name contains ours (not "... Women", "... U19")
  const league =
    leagues.find((l) => names(l).some((n) => wanted.includes(n))) ??
    leagues
      .filter((l) => !/women|kvinde|damer|u\d\d|youth|reserve/i.test(l.strLeague))
      .filter((l) => names(l).some((n) => wanted.some((w) => w.length > 3 && ` ${n} `.includes(` ${w} `))))
      .sort((a, b) => a.strLeague.length - b.strLeague.length)[0]
  state.lookups = { ...state.lookups, [division.id]: league ? `${league.strLeague} (${league.idLeague})` : `ikke fundet blandt ${leagues.length} ligaer i ${country}` }
  leagueIds.set(division.id, league ? Number(league.idLeague) : null)
  return league ? Number(league.idLeague) : undefined
}

/** Leagues with fixtures are refreshed every six hours; leagues not found yet are tried again every run */
const isDue = (divisionId: string, now = Date.now()) =>
  !base()?.leagues[divisionId]?.length || now - (base()?.checked?.[divisionId] ?? 0) > FULL_EVERY_MS - 60_000

/** Fetches every division not looked up within the last six hours */
async function runFull() {
  const missing: string[] = []
  for (const division of DIVISIONS) {
    if (!isDue(division.id)) {
      if (!base()?.leagues[division.id]?.length) missing.push(division.name)
      continue
    }
    const leagueId = await leagueIdFor(division)
    const events = leagueId ? await fullLeague(division, leagueId) : leagueIds.has(division.id) ? [] : undefined
    if (!events) continue // a request failed: try again next run
    if (events.length === 0) missing.push(division.name)
    // Publish league by league, so leagues show up while the rest are fetched
    const leagues = { ...(base()?.leagues ?? {}) }
    if (events.length > 0) leagues[division.id] = events
    publish(leagues, { ...(base()?.checked ?? {}), [division.id]: Date.now() })
  }
  state.missing = missing
  state.lastFull = Date.now()
}

/** Refetches the rounds with matches from six hours ago to three hours ahead */
async function runHot() {
  const current = base()
  if (!current) return
  const now = Date.now()
  const leagues = { ...current.leagues }
  let changed = false
  for (const division of DIVISIONS) {
    const divisionId = division.id
    const events = leagues[divisionId]
    const leagueId = await leagueIdFor(division)
    if (!events || !leagueId) continue
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
  // Divisions not looked up lately are fetched right away (also after a deploy that adds leagues)
  if (DIVISIONS.some((d) => isDue(d.id))) void guarded(runFull)
  setInterval(() => void guarded(runFull), 30 * 60_000).unref()
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
    missing: state.missing ?? [],
    leagues: DIVISIONS.map(({ id, name }) => {
      const events = data?.leagues[id] ?? []
      return {
        id,
        name,
        source: events.length && events[0].id.startsWith('db-') ? 'kampdatabasen' : events.length ? 'TheSportsDB' : undefined,
        lookup: KNOWN_LEAGUE_IDS[id] ? `kendt id ${KNOWN_LEAGUE_IDS[id]}` : state.lookups?.[id],
        events: events.length,
        finished: events.filter((e) => e.state === 'finished').length,
        teams: [...new Set(events.flatMap((e) => [e.home, e.away]))].sort(),
      }
    }),
  }
}
