import 'server-only'
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Incident, MatchState, SportId } from '../types'
import { danishRound, externalLeagueKey, type ExternalGame } from '../data/external'
import { alike } from '../data/aliases'
import { estimateXg, type FormGame, type Leaders, type LeaderRow, type Lineup, type MatchExtra, type MatchStats, type TableRow } from '../data/matchExtra'
import { addDays, isoDate } from './time'
import { cacheDir } from './tsdb'
import { logoCheckVersion, realLogo } from './logoCheck'
import { cupOfGame } from '../data/cups'
import { createHash } from 'node:crypto'
import { divisionOfGame } from '../data/ourLeagues'
import { DIVISIONS, SEASON, sportOf, type Division } from '../data/leagues'
import { archiveEvents, archiveMissingEvents, archiveSeason } from './archive'

// Games from API-Sports: football, basketball, NBA, ice hockey, handball,
// volleyball and NFL. Keys go in the server's environment: API_SPORTS_KEY for
// all sports, or API_SPORTS_KEY_<API> (e.g. API_SPORTS_KEY_NBA) per sport.
//
// Each API allows 100 requests a day on the free plan. One request fetches
// every game of one day, so the job fetches yesterday to ten days ahead a
// few times a day and spends the rest on today, more often while games are
// on. The remaining requests come from API-Sports' own response headers.
// Everything is kept in apisports.json, so a restart costs no requests.
//
// Finished games in our own leagues are kept for the season ("past"), so the
// standings can be filled in where TheSportsDB is missing games. Days before
// the window are fetched once each ("backfill") with requests left over.

type Api = 'football' | 'basketball' | 'nba' | 'hockey' | 'handball' | 'volleyball' | 'american-football'
type Raw = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any -- API-Sports' JSON differs per sport

interface ApiDef {
  sport: SportId
  label: string
  base: string
  /** Path for one day's games; NBA takes UTC dates, the others Danish time */
  path: (date: string) => string
  toGame: (r: Raw, api: Api) => ExternalGame | undefined
  /** Which leagues we show */
  keep: (g: ExternalGame) => boolean
  /** Path for the games between two teams */
  h2h: (a: number, b: number) => string
  /** Path for a team's latest games (the season's where the API needs a season) */
  teamGames?: (team: number, season?: string) => string | undefined
  /** Path for a league's table, and how to read it */
  standings?: (league: string, season?: string) => string | undefined
}

const TZ = 'timezone=Europe/Copenhagen'
const num = (v: unknown) => (v === null || v === undefined || v === '' ? undefined : Number(v))
const total = (v: unknown) => (typeof v === 'number' ? v : num((v as { total?: unknown } | null)?.total))

const FINISHED = new Set(['FT', 'AET', 'PEN', 'AOT', 'AP', 'AW'])
// Football writes PST for postponed, the other sports POST
const OFF = new Set(['PST', 'POST', 'CANC', 'ABD', 'SUSP', 'AWD', 'WO', 'INT'])
const UPCOMING = new Set(['NS', 'TBD'])
function stateOf(short: string): MatchState {
  if (FINISHED.has(short)) return 'finished'
  if (OFF.has(short)) return 'postponed'
  if (UPCOMING.has(short) || !short) return 'upcoming'
  return 'live'
}
const PERIOD_LABEL: Record<string, string> = { ET: 'Forl.', PT: 'Straffe', LIVE: 'Live', HT: 'Pause', BT: 'Pause', P: 'Straffe', OT: 'Forl.', Q1: '1. kvt.', Q2: '2. kvt.', Q3: '3. kvt.', Q4: '4. kvt.', P1: '1. periode', P2: '2. periode', P3: '3. periode' }

/** Youth and reserve teams are left out everywhere */
const notYouth = (g: ExternalGame) => !/\bU\s?\d{2}\b|youth|reserve|junior/i.test(g.league.name)
function leagues(byCountry: Record<string, RegExp>) {
  return (g: ExternalGame) => {
    if (!notYouth(g)) return false
    const rule = byCountry[g.league.country ?? '']
    return !!rule && rule.test(g.league.name)
  }
}

/** Games in the v1 format shared by basketball, hockey, handball and volleyball */
function v1Game(sport: SportId) {
  return (r: Raw, api: Api): ExternalGame | undefined => {
    if (!r?.id || !r.teams?.home?.name) return undefined
    const short = String(r.status?.short ?? '')
    const state = stateOf(short)
    return {
      id: `${api}-${r.id}`,
      sport,
      league: { id: String(r.league?.id ?? ''), name: String(r.league?.name ?? ''), country: r.country?.name, logo: r.league?.logo ?? undefined, season: r.league?.season != null ? String(r.league.season) : undefined },
      round: r.week ? String(r.week) : undefined,
      stadium: r.venue ? String(typeof r.venue === 'string' ? r.venue : (r.venue.name ?? '')) || undefined : undefined,
      home: { name: r.teams.home.name, logo: r.teams.home.logo ?? undefined, id: num(r.teams.home.id) },
      away: { name: r.teams.away.name, logo: r.teams.away.logo ?? undefined, id: num(r.teams.away.id) },
      kickoff: new Date(Number(r.timestamp) * 1000).toISOString(),
      state,
      label: state === 'live' ? (r.status?.timer ? `${r.status.timer}'` : (PERIOD_LABEL[short] ?? short)) : undefined,
      homeScore: total(r.scores?.home),
      awayScore: total(r.scores?.away),
    }
  }
}

const APIS: Record<Api, ApiDef> = {
  football: {
    sport: 'soccer',
    label: 'Fodbold',
    base: 'https://v3.football.api-sports.io',
    path: (d) => `/fixtures?date=${d}&${TZ}`,
    h2h: (a, b) => `/fixtures/headtohead?h2h=${a}-${b}&last=10&${TZ}`,
    teamGames: (t) => `/fixtures?team=${t}&last=10&${TZ}`,
    standings: (l, season) => (season ? `/standings?league=${l}&season=${season}` : undefined),
    toGame: (r, api) => {
      if (!r?.fixture?.id) return undefined
      const short = String(r.fixture.status?.short ?? '')
      const state = stateOf(short)
      const elapsed = r.fixture.status?.elapsed
      return {
        id: `${api}-${r.fixture.id}`,
        sport: 'soccer',
        league: { id: String(r.league?.id ?? ''), name: String(r.league?.name ?? ''), country: r.league?.country, logo: r.league?.logo ?? undefined, season: r.league?.season != null ? String(r.league.season) : undefined },
        home: { name: r.teams.home.name, logo: r.teams.home.logo ?? undefined, id: num(r.teams.home.id) },
        away: { name: r.teams.away.name, logo: r.teams.away.logo ?? undefined, id: num(r.teams.away.id) },
        kickoff: new Date(Number(r.fixture.timestamp) * 1000).toISOString(),
        state,
        label: state === 'live' ? (PERIOD_LABEL[short] ?? (elapsed ? `${elapsed}'` : short)) : undefined,
        homeScore: num(r.goals?.home),
        awayScore: num(r.goals?.away),
        venue: r.fixture.venue?.city ?? r.fixture.venue?.name ?? undefined,
        stadium: r.fixture.venue?.name ?? undefined,
        round: r.league?.round ?? undefined,
        referee: r.fixture.referee ?? undefined,
        ht: r.score?.halftime?.home != null && r.score?.halftime?.away != null ? [Number(r.score.halftime.home), Number(r.score.halftime.away)] : undefined,
      }
    },
    keep: (g) =>
      notYouth(g) &&
      ((g.league.country === 'Denmark') ||
        leagues({
          England: /^(Premier League|Championship|FA Cup|League Cup)$/,
          Germany: /^(Bundesliga|2\. Bundesliga|3\. Liga|DFB Pokal)$/,
          Spain: /^(La Liga|Copa del Rey)$/,
          Portugal: /^(Primeira Liga|Liga Portugal|Taça de Portugal)$/,
          Italy: /^(Serie A|Serie B|Coppa Italia)$/,
          France: /^(Ligue 1|Ligue 2|Coupe de France)$/,
          Scotland: /^(Premiership|Championship|FA Cup|League Cup)$/,
          Belgium: /^(Jupiler Pro League|Pro League|Challenger Pro League|Cup)$/,
          Austria: /^(Bundesliga|2\. Liga|Cup)$/,
          Switzerland: /^(Super League|Challenge League|Schweizer Pokal|Swiss Cup)$/,
          Turkey: /^(Süper Lig|Super Lig|1\. Lig|Cup)$/,
          USA: /^(Major League Soccer|MLS|MLS Cup|US Open Cup)$/,
          Sweden: /^(Allsvenskan|Superettan|Svenska Cupen)$/,
          Norway: /^(Eliteserien|OBOS-ligaen|1\. Division|NM Cupen)$/,
          Netherlands: /^(Eredivisie)$/,
          // UEFA's club competitions (Champions League, Europa League, Conference League, women's Champions League) and national teams
          World: /UEFA|World Cup|Nations League|Euro Championship|Friendlies$/,
        })(g)),
  },
  basketball: {
    sport: 'basketball',
    label: 'Basketball',
    base: 'https://v1.basketball.api-sports.io',
    path: (d) => `/games?date=${d}&${TZ}`,
    h2h: (a, b) => `/games/h2h?h2h=${a}-${b}&${TZ}`,
    teamGames: (t, season) => (season ? `/games?team=${t}&season=${season}&${TZ}` : undefined),
    standings: (l, season) => (season ? `/standings?league=${l}&season=${season}` : undefined),
    toGame: v1Game('basketball'),
    // NBA comes from its own API
    keep: (g) =>
      g.league.name !== 'NBA' &&
      (g.league.country === 'Denmark' ? notYouth(g) : leagues({ Europe: /Euroleague|Eurocup|Champions League/i, World: /FIBA|World Cup/i, Spain: /^ACB$/, Germany: /^BBL$/ })(g)),
  },
  nba: {
    sport: 'basketball',
    label: 'NBA',
    base: 'https://v2.nba.api-sports.io',
    path: (d) => `/games?date=${d}`,
    h2h: (a, b) => `/games?h2h=${a}-${b}`,
    teamGames: (t, season) => (season ? `/games?team=${t}&season=${season}` : undefined),
    toGame: (r, api) => {
      if (!r?.id || !r.teams?.home?.name) return undefined
      const status = Number(r.status?.short)
      const state: MatchState = status === 3 ? 'finished' : status === 2 ? 'live' : 'upcoming'
      return {
        id: `${api}-${r.id}`,
        sport: 'basketball',
        league: { id: 'standard', name: 'NBA', country: 'USA' },
        home: { name: r.teams.home.name, logo: r.teams.home.logo ?? undefined, id: num(r.teams.home.id) },
        away: { name: r.teams.visitors.name, logo: r.teams.visitors.logo ?? undefined, id: num(r.teams.visitors.id) },
        kickoff: new Date(String(r.date?.start)).toISOString(),
        state,
        label: state === 'live' ? (r.status?.halftime ? 'Pause' : `${r.periods?.current ?? ''}. kvt.`) : undefined,
        homeScore: num(r.scores?.home?.points),
        awayScore: num(r.scores?.visitors?.points),
        venue: r.arena?.city ?? undefined,
      }
    },
    keep: () => true,
  },
  hockey: {
    sport: 'ice_hockey',
    label: 'Ishockey',
    base: 'https://v1.hockey.api-sports.io',
    path: (d) => `/games?date=${d}&${TZ}`,
    h2h: (a, b) => `/games/h2h?h2h=${a}-${b}&${TZ}`,
    teamGames: (t, season) => (season ? `/games?team=${t}&season=${season}&${TZ}` : undefined),
    standings: (l, season) => (season ? `/standings?league=${l}&season=${season}` : undefined),
    toGame: v1Game('ice_hockey'),
    keep: (g) =>
      g.league.country === 'Denmark'
        ? notYouth(g)
        : leagues({
            Sweden: /^(SHL|HockeyAllsvenskan)$/,
            Finland: /^Liiga$/,
            Germany: /^DEL$/,
            Switzerland: /^National League$/,
            USA: /^NHL$/,
            Europe: /Champions Hockey League/i,
            World: /World Championship|Olympic/i,
          })(g),
  },
  handball: {
    sport: 'handball',
    label: 'Håndbold',
    base: 'https://v1.handball.api-sports.io',
    path: (d) => `/games?date=${d}&${TZ}`,
    h2h: (a, b) => `/games/h2h?h2h=${a}-${b}&${TZ}`,
    teamGames: (t, season) => (season ? `/games?team=${t}&season=${season}&${TZ}` : undefined),
    standings: (l, season) => (season ? `/standings?league=${l}&season=${season}` : undefined),
    toGame: v1Game('handball'),
    keep: (g) =>
      g.league.country === 'Denmark'
        ? notYouth(g)
        : leagues({
            Germany: /^Bundesliga$/,
            Sweden: /^Handbollsligan$/,
            Norway: /^REMA 1000-ligaen$/,
            France: /^Starligue$/,
            Spain: /^Liga ASOBAL$/,
            Europe: /EHF/i,
            World: /World Championship|European Championship|Olympic/i,
          })(g),
  },
  volleyball: {
    sport: 'volleyball',
    label: 'Volleyball',
    base: 'https://v1.volleyball.api-sports.io',
    path: (d) => `/games?date=${d}&${TZ}`,
    h2h: (a, b) => `/games/h2h?h2h=${a}-${b}&${TZ}`,
    teamGames: (t, season) => (season ? `/games?team=${t}&season=${season}&${TZ}` : undefined),
    standings: (l, season) => (season ? `/standings?league=${l}&season=${season}` : undefined),
    toGame: v1Game('volleyball'),
    keep: (g) =>
      g.league.country === 'Denmark'
        ? notYouth(g)
        : leagues({ Italy: /^SuperLega$/, Poland: /^PlusLiga$/, Europe: /CEV/i, World: /Nations League|World Championship|Olympic/i })(g),
  },
  'american-football': {
    sport: 'american_football',
    label: 'NFL',
    base: 'https://v1.american-football.api-sports.io',
    path: (d) => `/games?date=${d}&${TZ}`,
    h2h: (a, b) => `/games?h2h=${a}-${b}&${TZ}`,
    teamGames: (t, season) => (season ? `/games?team=${t}&season=${season}&${TZ}` : undefined),
    toGame: (r, api) => {
      const game = r?.game
      if (!game?.id || !r.teams?.home?.name) return undefined
      const short = String(game.status?.short ?? '')
      const state = stateOf(short)
      return {
        id: `${api}-${game.id}`,
        sport: 'american_football',
        league: { id: String(r.league?.id ?? ''), name: String(r.league?.name ?? ''), country: r.league?.country?.name, logo: r.league?.logo ?? undefined },
        home: { name: r.teams.home.name, logo: r.teams.home.logo ?? undefined, id: num(r.teams.home.id) },
        away: { name: r.teams.away.name, logo: r.teams.away.logo ?? undefined, id: num(r.teams.away.id) },
        kickoff: new Date(Number(game.date?.timestamp) * 1000).toISOString(),
        state,
        label: state === 'live' ? (PERIOD_LABEL[short] ?? short) : undefined,
        homeScore: total(r.scores?.home),
        awayScore: total(r.scores?.away),
        venue: game.venue?.city ?? undefined,
      }
    },
    keep: (g) => g.league.name === 'NFL',
  },
}

const fingerprint = (key?: string) => (key ? createHash('sha256').update(key).digest('hex').slice(0, 12) : undefined)

const keyFor = (api: Api) =>
  process.env[`API_SPORTS_KEY_${api.replace('-', '_').toUpperCase()}`]?.trim() || process.env.API_SPORTS_KEY?.trim() || undefined

// ---------------------------------------------------------------- the cache file

interface DayData {
  fetchedAt: number
  games: ExternalGame[]
}
/** An API-Sports league that is not one of ours */
export interface ExternalLeague {
  key: string
  api: string
  id: string
  name: string
  country?: string
  sport: SportId
  logo?: string
  season?: string
  lastSeen: number
}

interface ApiState {
  days: Record<string, DayData>
  /** Finished games in our leagues, by day, kept after the day leaves the window */
  past?: Record<string, ExternalGame[]>
  /** Days before the window fetched once for the past games */
  backfilled?: Record<string, number>
  /** Days the plan gives access to, relative to today (the free plan: yesterday to tomorrow) */
  allowedDays?: { from: number; to: number }
  /** Our divisions' league ids at this API, learned from the games it returns */
  leagueIds?: Record<string, string>
  /** Past seasons saved in the statistics bank: "division|year" -> matches saved (0: none or refused) */
  history?: Record<string, number>
  /** API-Sports' leagues that are not ours, by externalLeagueKey, for their league pages */
  leagues?: Record<string, ExternalLeague>
  /** Goals seen from the score changing between two fetches, by game id (the minute is approximate) */
  goalLog?: Record<string, { at: number; goals: Incident[] }>
  remaining?: number
  limit?: number
  /** UTC date the remaining count belongs to (the quota resets at 00:00 UTC) */
  quotaDay?: string
  lastError?: string
  lastErrorAt?: number
  requests?: number
  /** Fingerprint of the key the error came with; a new key is tried right away */
  keyFingerprint?: string
  /** When a paid plan was first seen (the free plan's limits were then cleared) */
  paidSince?: number
  /** Whole seasons fetched for our leagues and cups (paid plans): league id -> when */
  seasonSynced?: Record<string, number>
}
type Store = Record<string, ApiState>

const file = (): string => process.env.APISPORTS_FILE ?? path.join(/*turbopackIgnore: true*/ cacheDir(), 'apisports.json')

// On globalThis: the job and the pages load separate copies of this module
const holder = globalThis as { __scorelineApiSports?: { store: Store; mtime: number; readAt: number; games?: ExternalGame[] } }
const mem = (holder.__scorelineApiSports ??= { store: {}, mtime: 0, readAt: 0 })

function load() {
  const now = Date.now()
  if (now - mem.readAt < 15_000) return
  mem.readAt = now
  try {
    const mtime = statSync(file()).mtimeMs
    if (mtime !== mem.mtime) {
      mem.store = JSON.parse(readFileSync(file(), 'utf8')) as Store
      mem.mtime = mtime
      mem.games = undefined
    }
  } catch {
    // No file yet
  }
}

function save() {
  try {
    mkdirSync(path.dirname(file()), { recursive: true })
    writeFileSync(`${file()}.tmp`, JSON.stringify(mem.store))
    renameSync(`${file()}.tmp`, file())
    mem.mtime = statSync(file()).mtimeMs
    mem.games = undefined
  } catch {
    // try again next time
  }
}

const window = (today: string) => Array.from({ length: 12 }, (_, i) => addDays(today, i - 1))

/** Every game from yesterday to ten days ahead, all APIs; and a version that changes with them */
export function externalGames(): { version: string; games: ExternalGame[] } {
  load()
  if (!mem.games) {
    const today = isoDate(Date.now())
    const days = new Set(window(today))
    const byId = new Map<string, ExternalGame>()
    for (const [api, s] of Object.entries(mem.store)) {
      const def = APIS[api as Api]
      if (!def) continue
      // Newest fetch last, so it wins for games that appear on two fetched days
      const fetched = Object.values(s.days).sort((a, b) => a.fetchedAt - b.fetchedAt)
      for (const d of fetched) for (const g of d.games) if (days.has(isoDate(new Date(g.kickoff)))) byId.set(g.id, g)
    }
    mem.games = [...byId.values()].sort((a, b) => a.kickoff.localeCompare(b.kickoff))
  }
  return { version: String(Math.round(mem.mtime)), games: mem.games }
}

const inOurLeague = (g: ExternalGame) => g.state === 'finished' && g.homeScore !== undefined && (!!divisionOfGame(g) || !!cupOfGame(g))

/** The finished games in our leagues this season (kept days and the current window) */
export function seasonGames(): ExternalGame[] {
  load()
  const byId = new Map<string, ExternalGame>()
  for (const s of Object.values(mem.store)) {
    for (const games of Object.values(s.past ?? {})) for (const g of games) byId.set(g.id, g)
    for (const d of Object.values(s.days)) for (const g of d.games) if (inOurLeague(g)) byId.set(g.id, g)
  }
  return [...byId.values()]
}

// ---------------------------------------------------------------- fetching

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const utcDay = () => new Date().toISOString().slice(0, 10)
const msUntilReset = () => {
  const d = new Date()
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - d.getTime()
}

/** One request to an API; keeps the quota from the response headers */
async function call(api: Api, pathAndQuery: string, timeoutMs = 20_000): Promise<{ response?: Raw[]; error?: string }> {
  const s = (mem.store[api] ??= { days: {} })
  s.requests = (s.requests ?? 0) + 1
  try {
    // API_SPORTS_BASE points every API elsewhere (for tests)
    const base = process.env.API_SPORTS_BASE ? `${process.env.API_SPORTS_BASE}/${api}` : APIS[api].base
    const res = await fetch(base + pathAndQuery, {
      headers: { 'x-apisports-key': keyFor(api)! },
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    })
    const remaining = num(res.headers.get('x-ratelimit-requests-remaining'))
    const limit = num(res.headers.get('x-ratelimit-requests-limit'))
    if (remaining !== undefined) {
      s.remaining = remaining
      s.quotaDay = utcDay()
    }
    if (limit !== undefined) s.limit = limit
    onPaidPlan(s)
    const body = (await res.json()) as { response?: Raw[]; errors?: unknown }
    const errors: string[] = !body.errors ? [] : (Array.isArray(body.errors) ? body.errors : Object.values(body.errors as object)).map(String)
    if (!res.ok || errors.length) return { error: `${res.status} ${errors.join('; ') || res.statusText}` }
    return { response: body.response ?? [] }
  } catch (err) {
    return { error: (err as Error).message }
  }
}

/**
 * A plan limit on dates ("Free plans do not have access to this date, try from
 * 2026-09-25 to 2026-09-27"): kept as days relative to today, so the job only
 * asks for days it can get instead of pausing on the error.
 */
function planLimit(s: ApiState, error: string): boolean {
  const m = /try from (\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})/.exec(error)
  if (!m) return false
  const today = Date.parse(isoDate(Date.now()))
  const days = (d: string) => Math.round((Date.parse(d) - today) / 86_400_000)
  s.allowedDays = { from: days(m[1]), to: days(m[2]) }
  return true
}

/** Whether the plan gives access to a day */
function allowed(s: ApiState | undefined, date: string, today: string) {
  const a = s?.allowedDays
  return !a || (date >= addDays(today, a.from) && date <= addDays(today, a.to))
}

/** A paid plan: more than the free plan's 100 requests a day */
const isPaid = (s: ApiState | undefined) => (s?.limit ?? 100) > 100

/**
 * The first time a paid plan answers, the free plan's limits are forgotten:
 * the days it gave, and the past seasons it refused (asked for again).
 */
function onPaidPlan(s: ApiState) {
  if (!isPaid(s) || s.paidSince) return
  s.paidSince = Date.now()
  s.allowedDays = undefined
  if (s.lastError && /plan|access|try from/i.test(s.lastError)) {
    s.lastError = undefined
    s.lastErrorAt = undefined
  }
  for (const [k, v] of Object.entries(s.history ?? {})) if (v === 0) delete s.history![k]
}

/** Requests a day for the match pages' extras (head-to-head, form, tables, events, statistics) */
const extrasPerDay = (s: ApiState | undefined) => (isPaid(s) ? Math.max(30, (s!.limit ?? 100) - PAID_RESERVE) : 30)
/** Requests a paid plan always keeps for the live scores: everything else may use the rest */
const PAID_RESERVE = 300

async function fetchDay(api: Api, date: string) {
  const def = APIS[api]
  const s = (mem.store[api] ??= { days: {} })
  const { response, error } = await call(api, def.path(date))
  if (error && planLimit(s, error)) {
    // Not an error to wait out: the job just stays within the plan's days
    s.days[date] = { fetchedAt: Date.now(), games: s.days[date]?.games ?? [] }
    return
  }
  if (error) {
    s.lastError = error
    s.lastErrorAt = Date.now()
    s.keyFingerprint = fingerprint(keyFor(api))
    // Do not ask for this day again right away
    s.days[date] = { fetchedAt: Date.now(), games: s.days[date]?.games ?? [] }
    return
  }
  const games = (response ?? []).map((r) => def.toGame(r, api)).filter((g): g is ExternalGame => !!g && def.keep(g))
  logGoals(s, s.days[date]?.games ?? [], games)
  s.days[date] = { fetchedAt: Date.now(), games: keepEvents(s.days[date]?.games ?? [], games) }
  s.lastError = undefined
  // The other leagues, remembered for their league pages
  for (const g of games) {
    if (divisionOfGame(g) || !g.league.id) continue
    const key = externalLeagueKey(g.league)
    ;(s.leagues ??= {})[key] = { key, api, id: g.league.id, name: g.league.name, country: g.league.country, sport: g.sport, logo: g.league.logo, season: g.league.season, lastSeen: Date.now() }
  }
}

/** An API-Sports league (not ours) by its key, if we have seen its games */
export function externalLeague(key: string): ExternalLeague | undefined {
  load()
  for (const s of Object.values(mem.store)) if (s.leagues?.[key]) return { ...s.leagues[key], logo: realLogo(s.leagues[key].logo) }
  // Not remembered yet: from the games we have
  for (const [api, s] of Object.entries(mem.store)) {
    const days = [...Object.values(s.days), ...Object.values(s.past ?? {}).map((games) => ({ games, fetchedAt: 0 }))]
    for (const d of days) {
      const g = d.games.find((x) => !divisionOfGame(x) && x.league.id && externalLeagueKey(x.league) === key)
      if (g) return { key, api, id: g.league.id, name: g.league.name, country: g.league.country, sport: g.sport, logo: realLogo(g.league.logo), season: g.league.season, lastSeen: d.fetchedAt }
    }
  }
  return undefined
}

/** Every API-Sports league (not ours) we have seen */
export function externalLeagues(): ExternalLeague[] {
  load()
  return Object.values(mem.store).flatMap((s) => Object.values(s.leagues ?? {}).map((l) => ({ ...l, logo: realLogo(l.logo) })))
}

/** API-Sports' own table for a league (cached six hours); undefined when the plan or the budget doesn't allow it */
export async function apiLeagueTable(league: ExternalLeague): Promise<TableRow[][] | undefined> {
  const api = league.api as Api
  const def = APIS[api]
  if (!def?.standings) return undefined
  const groups = await cached(api, `${api}|table|${league.id}|${league.season ?? ''}`, 6 * 3_600_000, def.standings(league.id, league.season), 'table', readTable).catch(
    () => undefined,
  )
  const shown = groups?.filter((g) => g.length > 1).map((g) => g.map((r) => ({ ...r, logo: realLogo(r.logo) })))
  return shown?.length ? shown : undefined
}

/** The day of this API most in need of a refresh, or nothing when the quota is spent */
function dueDay(api: Api, now: number): string | undefined {
  const s = mem.store[api] ?? { days: {} }
  const remaining = s.quotaDay === utcDay() ? (s.remaining ?? 100) : (s.limit ?? 100)
  if (remaining <= 2) return undefined
  // An earlier plan-limit error is not one to wait out
  if (s.lastError && /try from \d{4}-\d{2}-\d{2} to/.test(s.lastError)) {
    // The days are relative to when the error came, so only trust one from today
    if (s.lastErrorAt && isoDate(s.lastErrorAt) === isoDate(now)) planLimit(s, s.lastError)
    s.lastError = undefined
    s.lastErrorAt = undefined
  }
  // Wait an hour after an error (a plan restriction or a wrong key would repeat), unless the key has changed since
  if (s.lastErrorAt && now - s.lastErrorAt < 3_600_000 && s.keyFingerprint === fingerprint(keyFor(api))) return undefined
  const today = isoDate(now)
  const age = (d: string) => now - (s.days[d]?.fetchedAt ?? 0)
  const todays = s.days[today]?.games ?? []
  const busy = todays.some((g) => {
    const t = Date.parse(g.kickoff)
    return g.state === 'live' || (g.state === 'upcoming' && t < now + 20 * 60_000 && t > now - 4 * 3_600_000)
  })
  // While games are on, today gets the requests left over after the other days
  const todayEvery = busy ? Math.max(isPaid(s) ? 60_000 : 5 * 60_000, msUntilReset() / Math.max(1, remaining - 14)) : isPaid(s) ? 15 * 60_000 : 60 * 60_000
  if (age(today) > todayEvery) return today
  const yesterday = addDays(today, -1)
  if (allowed(s, yesterday, today) && age(yesterday) > 6 * 3_600_000) return yesterday
  for (const d of window(today).slice(2)) if (allowed(s, d, today) && age(d) > (d === addDays(today, 1) ? 3 : 12) * 3_600_000) return d
  return undefined
}

/** How far back the past games are fetched, and how long they are kept */
const BACKFILL_DAYS = 60
const BACKFILL_KEEP_DAYS = 330

/** The newest day before the window not fetched yet, when enough requests are left over */
function backfillDay(api: Api, now: number): string | undefined {
  const s = mem.store[api]
  if (!s) return undefined
  const remaining = s.quotaDay === utcDay() ? (s.remaining ?? 100) : (s.limit ?? 100)
  if (remaining <= 40) return undefined
  if (s.lastErrorAt && now - s.lastErrorAt < 3_600_000 && s.keyFingerprint === fingerprint(keyFor(api))) return undefined
  const today = isoDate(now)
  for (let i = 2; i <= BACKFILL_DAYS; i++) {
    const d = addDays(today, -i)
    if (!allowed(s, d, today)) continue
    if (!s.days[d] && !s.backfilled?.[d]) return d
  }
  return undefined
}

// ---------------------------------------------------------------- past seasons for club history

/** Which API has each sport's leagues */
const API_FOR_SPORT: Partial<Record<SportId, Api>> = { soccer: 'football', ice_hockey: 'hockey', basketball: 'basketball', handball: 'handball' }
/** API-Football's ids for our football leagues (the rest are learned from the games) */
const FOOTBALL_IDS: Record<string, string> = {
  superliga: '119', '1div': '120', premierleague: '39', championship: '40', laliga: '140', ligaportugal: '94',
  bundesliga: '78', bundesliga2: '79', liga3: '80', allsvenskan: '113', eliteserien: '103',
}
/** Past seasons for the club pages: the free plan gives 2021–2023, a paid plan the 15 before this one (newest first) */
const HISTORY_YEARS = [2023, 2022, 2021]
const PAID_HISTORY_SEASONS = 15
const historyYears = (s: ApiState) => {
  const current = Number(SEASON.slice(0, 4))
  return isPaid(s) ? Array.from({ length: PAID_HISTORY_SEASONS }, (_, i) => current - 1 - i) : HISTORY_YEARS
}

/** Learns our divisions' league ids from the games an API has returned */
function learnLeagueIds(api: Api) {
  const s = mem.store[api]
  if (!s) return
  const games = [...Object.values(s.days).flatMap((d) => d.games), ...Object.values(s.past ?? {}).flat()]
  for (const g of games) {
    const d = divisionOfGame(g)?.d
    if (d && g.league.id && !s.leagueIds?.[d.id]) (s.leagueIds ??= {})[d.id] = g.league.id
  }
}

/** The next past season to fetch for one of our leagues, or nothing */
function historyDue(api: Api): { division: Division; league: string; year: number } | undefined {
  const s = mem.store[api]
  if (!s) return undefined
  const remaining = s.quotaDay === utcDay() ? (s.remaining ?? 100) : (s.limit ?? 100)
  if (remaining <= 40) return undefined
  learnLeagueIds(api)
  for (const division of DIVISIONS) {
    if (API_FOR_SPORT[sportOf(division)] !== api) continue
    const league = (api === 'football' ? FOOTBALL_IDS[division.id] : undefined) ?? s.leagueIds?.[division.id]
    if (!league) continue
    for (const year of historyYears(s)) if (s.history?.[`${division.id}|${year}`] === undefined) return { division, league, year }
  }
  return undefined
}

/** Season as the API writes it and as we label it ("2022/2023", or "2022" for calendar-year leagues) */
function seasonNames(api: Api, division: Division, year: number) {
  const calendar = /^\d{4}$/.test(division.seasonLabel ?? '')
  return {
    param: api === 'basketball' ? `${year}-${year + 1}` : String(year),
    label: calendar ? String(year) : `${year}/${year + 1}`,
  }
}

async function fetchHistory(api: Api, due: { division: Division; league: string; year: number }) {
  const s = mem.store[api]!
  const { param, label } = seasonNames(api, due.division, due.year)
  const path = api === 'football' ? `/fixtures?league=${due.league}&season=${param}&${TZ}` : `/games?league=${due.league}&season=${param}&${TZ}`
  const { response, error } = await call(api, path)
  const key = `${due.division.id}|${due.year}`
  if (error) {
    // A season the plan refuses is not asked for again; other errors are retried later
    if (/plan|access|season/i.test(error)) (s.history ??= {})[key] = 0
    return
  }
  const games = (response ?? []).map((r) => APIS[api].toGame(r, api)).filter((g): g is ExternalGame => !!g)
  let saved = 0
  try {
    saved = archiveSeason(due.division.id, due.division.name, label, games)
  } catch {
    return // try again next time
  }
  ;(s.history ??= {})[key] = saved
}

/**
 * This season's league (or cup) due for a full fetch of its games, on a paid
 * plan: one request gives the whole season, so our leagues' tables and the
 * cup's rounds are complete, not just the days the job has seen. Every hour.
 */
function seasonDue(api: Api, now: number): { league: string } | undefined {
  const s = mem.store[api]
  if (!s || !isPaid(s) || api !== 'football') return undefined
  const remaining = s.quotaDay === utcDay() ? (s.remaining ?? 100) : (s.limit ?? 100)
  if (remaining <= PAID_RESERVE) return undefined
  learnLeagueIds(api)
  const wanted = new Set<string>()
  for (const d of DIVISIONS) {
    if (API_FOR_SPORT[sportOf(d)] !== api) continue
    const league = FOOTBALL_IDS[d.id] ?? s.leagueIds?.[d.id]
    if (league) wanted.add(league)
  }
  // The cups, by the league id their games have
  const seen = [...Object.values(s.days).flatMap((d) => d.games), ...Object.values(s.past ?? {}).flat()]
  for (const g of seen) if (cupOfGame(g) && g.league.id) wanted.add(g.league.id)
  const league = [...wanted]
    .filter((l) => now - (s.seasonSynced?.[l] ?? 0) > 3_600_000)
    .sort((a, b) => (s.seasonSynced?.[a] ?? 0) - (s.seasonSynced?.[b] ?? 0))[0]
  return league ? { league } : undefined
}

async function fetchSeason(api: Api, due: { league: string }) {
  const s = mem.store[api]!
  ;(s.seasonSynced ??= {})[due.league] = Date.now()
  const { response, error } = await call(api, `/fixtures?league=${due.league}&season=${SEASON.slice(0, 4)}&${TZ}`)
  if (error) return
  const games = (response ?? []).map((r) => APIS[api].toGame(r, api)).filter((g): g is ExternalGame => !!g && inOurLeague(g))
  const byDay = new Map<string, ExternalGame[]>()
  for (const g of games) {
    const day = isoDate(new Date(g.kickoff))
    if (!byDay.has(day)) byDay.set(day, [])
    byDay.get(day)!.push(g)
  }
  for (const [day, list] of byDay) {
    const kept = new Map((s.past?.[day] ?? []).map((g) => [g.id, g]))
    for (const g of keepEvents(s.past?.[day] ?? [], list)) kept.set(g.id, g)
    ;(s.past ??= {})[day] = [...kept.values()]
  }
}

let running = false
async function tick() {
  if (running) return
  running = true
  try {
    load()
    const now = Date.now()
    let changed = false
    for (const api of Object.keys(APIS) as Api[]) {
      if (!keyFor(api)) continue
      // A paid plan catches up several days a run
      for (let n = isPaid(mem.store[api]) ? 6 : 1; n > 0; n--) {
        const day = dueDay(api, Date.now())
        if (!day) break
        // NBA dates are UTC: Danish evenings in the US fall on the next UTC day
        await fetchDay(api, day)
        changed = true
        await sleep(isPaid(mem.store[api]) ? 500 : 2_000)
      }
    }
    // Days before the window, once each, with requests left over (for the standings)
    for (const api of Object.keys(APIS) as Api[]) {
      if (!keyFor(api) || dueDay(api, now)) continue
      const day = backfillDay(api, now)
      if (!day) continue
      const { response, error } = await call(api, APIS[api].path(day))
      const s = mem.store[api]!
      if (error && planLimit(s, error)) {
        // outside the plan's days: nothing more to fetch back in time
      } else if (error) {
        s.lastError = error
        s.lastErrorAt = Date.now()
        s.keyFingerprint = fingerprint(keyFor(api))
      } else {
        const games = (response ?? []).map((r) => APIS[api].toGame(r, api)).filter((g): g is ExternalGame => !!g && inOurLeague(g))
        ;(s.past ??= {})[day] = games
        ;(s.backfilled ??= {})[day] = Date.now()
      }
      changed = true
      await sleep(2_000)
    }
    // This season in full for our leagues and cups (paid plans), one league per API per run
    for (const api of Object.keys(APIS) as Api[]) {
      if (!keyFor(api) || dueDay(api, now)) continue
      for (let n = 15; n > 0; n--) {
        const due = seasonDue(api, Date.now())
        if (!due) break
        await fetchSeason(api, due)
        changed = true
        await sleep(300)
      }
    }
    // Goals and cards for our leagues' and cups' games (paid plans), 20 games a request
    {
      const s = mem.store.football
      for (let n = 20; s && keyFor('football') && !dueDay('football', Date.now()) && n > 0; n--) {
        const ids = eventsDue(s)
        if (!ids.length) break
        await fetchEvents('football', ids)
        changed = true
        await sleep(300)
      }
    }
    // Goals and cards for the past seasons in the statistics bank (paid plans), 20 matches a request, down to the reserve
    {
      const s = mem.store.football
      for (let n = 40; s && isPaid(s) && keyFor('football') && !dueDay('football', Date.now()) && n > 0; n--) {
        const remaining = s.quotaDay === utcDay() ? (s.remaining ?? 0) : (s.limit ?? 0)
        if (remaining < PAID_RESERVE) break
        const ids = archiveMissingEvents(20)
        if (!ids.length) break
        const { response, error } = await call('football', `/fixtures?ids=${ids.map((id) => id.split('-').pop()).join('-')}&${TZ}`)
        if (error) break
        const found = (response ?? []).map((r) => ({
          id: `football-${r.fixture?.id}`,
          incidents: toIncidents(r.events ?? [], { home: { name: '', id: num(r.teams?.home?.id) }, away: { name: '', id: num(r.teams?.away?.id) } }),
        }))
        try {
          archiveEvents(
            found.filter((f) => f.incidents.length),
            ids,
          )
        } catch {
          break
        }
        changed = true
        await sleep(300)
      }
    }
    // Past seasons of our leagues for the club pages' history, with requests left over, one per API per run
    for (const api of Object.keys(APIS) as Api[]) {
      if (!keyFor(api) || dueDay(api, now)) continue
      // A paid plan fetches several seasons a run
      for (let n = isPaid(mem.store[api]) ? 15 : 1; n > 0; n--) {
        const due = historyDue(api)
        if (!due) break
        try {
          await fetchHistory(api, due)
        } catch {
          // an unexpected answer: marked so the job doesn't ask again and again
          ;(mem.store[api]!.history ??= {})[`${due.division.id}|${due.year}`] = 0
        }
        changed = true
        await sleep(isPaid(mem.store[api]) ? 300 : 2_000)
      }
    }
    // Days that leave the window: our leagues' results are kept for the season, the rest is forgotten
    const oldest = addDays(isoDate(now), -3)
    const keepFrom = addDays(isoDate(now), -BACKFILL_KEEP_DAYS)
    for (const s of Object.values(mem.store)) {
      for (const d of Object.keys(s.days)) {
        if (d >= oldest) continue
        const kept = s.days[d].games.filter(inOurLeague)
        if (kept.length) (s.past ??= {})[d] = kept
        delete s.days[d]
      }
      for (const d of Object.keys(s.past ?? {})) if (d < keepFrom) delete s.past![d]
      for (const d of Object.keys(s.backfilled ?? {})) if (d < keepFrom) delete s.backfilled![d]
    }
    if (changed) save()
  } finally {
    running = false
  }
}

let started = false
/** Starts the API-Sports job (every minute it fetches at most one day per sport). Called from instrumentation.ts. */
export function startApiSportsSync() {
  if (started || process.env.API_SPORTS === 'off') return
  started = true
  if (!(Object.keys(APIS) as Api[]).some(keyFor)) return
  const run = () => tick().catch((err) => console.error('API-Sports-jobbet fejlede:', err))
  void run()
  setInterval(() => void run(), 60_000).unref()
}

/** Numbers for the status page */
export function apiSportsStatus() {
  load()
  const today = isoDate(Date.now())
  return (Object.keys(APIS) as Api[]).map((api) => {
    const s = mem.store[api]
    const games = Object.values(s?.days ?? {}).flatMap((d) => d.games)
    const fetchedToday = s?.days[today]?.fetchedAt
    return {
      api,
      label: APIS[api].label,
      hasKey: !!keyFor(api),
      remaining: s?.quotaDay === utcDay() ? s?.remaining : undefined,
      limit: s?.limit,
      requestsSinceStart: s?.requests ?? 0,
      days: Object.keys(s?.days ?? {}).length,
      pastGames: Object.values(s?.past ?? {}).reduce((n, g) => n + g.length, 0),
      backfilledDays: Object.keys(s?.backfilled ?? {}).length,
      games: new Set(games.map((g) => g.id)).size,
      leagues: [...new Set(games.map((g) => `${g.league.name}${g.league.country ? ` (${g.league.country})` : ''}`))].sort(),
      todayFetchedAt: fetchedToday ? new Date(fetchedToday).toISOString() : null,
      lastError: s?.lastError ?? null,
      allowedDays: s?.allowedDays ?? null,
      history: Object.entries(s?.history ?? {}).map(([k, n]) => ({ key: k, matches: n })),
    }
  })
}

// ---------------------------------------------------------------- match page extras
// Head-to-head, the teams' latest games and the league table, fetched when a
// match page is first viewed and cached (h2h.json). They share a small daily
// budget per API and are never fetched when the day's quota runs low.

interface ExtraStore {
  entries: Record<string, { fetchedAt: number; games?: ExternalGame[]; table?: TableRow[][]; incidents?: Incident[]; final?: boolean; stats?: Record<'home' | 'away', Record<string, string | number | null>>; catalog?: CatalogLeague[]; lineups?: Lineup[]; leaders?: Leaders }>
  /** Requests spent on extras per API and UTC day */
  spent: Record<string, { day: string; count: number }>
}
const EXTRAS_KEEP_REMAINING = 20
const extrasFile = (): string => process.env.H2H_FILE ?? path.join(/*turbopackIgnore: true*/ cacheDir(), 'h2h.json')
const extrasHolder = globalThis as { __scorelineH2h?: ExtraStore }
function extrasStore(): ExtraStore {
  if (!extrasHolder.__scorelineH2h) {
    try {
      extrasHolder.__scorelineH2h = JSON.parse(readFileSync(extrasFile(), 'utf8')) as ExtraStore
    } catch {
      extrasHolder.__scorelineH2h = { entries: {}, spent: {} }
    }
  }
  return extrasHolder.__scorelineH2h
}

const apiOf = (game: ExternalGame) => game.id.split('-').slice(0, -1).join('-') as Api

/** One cached request; the cached answer (also a stale one) when the budget or the request fails */
async function cached<T extends 'games' | 'table'>(
  api: Api,
  key: string,
  ttlMs: number,
  pathAndQuery: string | undefined,
  kind: T,
  read: (response: Raw[]) => NonNullable<ExtraStore['entries'][string][T]>,
): Promise<ExtraStore['entries'][string][T] | undefined> {
  const store = extrasStore()
  const entry = store.entries[key]
  if (entry && Date.now() - entry.fetchedAt < ttlMs) return entry[kind]
  if (!pathAndQuery || !keyFor(api)) return entry?.[kind]
  load()
  const s = mem.store[api]
  const remaining = s?.quotaDay === utcDay() ? (s.remaining ?? 100) : (s?.limit ?? 100)
  const spent = store.spent[api]?.day === utcDay() ? store.spent[api].count : 0
  if (remaining <= EXTRAS_KEEP_REMAINING || spent >= extrasPerDay(s)) return entry?.[kind]
  store.spent[api] = { day: utcDay(), count: spent + 1 }
  const { response, error } = await call(api, pathAndQuery, 5_000)
  if (error) return entry?.[kind]
  const fresh = { fetchedAt: Date.now(), [kind]: read(response ?? []) }
  store.entries[key] = fresh
  // Old entries go after a month
  for (const [k, e] of Object.entries(store.entries)) if (Date.now() - e.fetchedAt > 30 * 86_400_000) delete store.entries[k]
  try {
    mkdirSync(path.dirname(extrasFile()), { recursive: true })
    writeFileSync(`${extrasFile()}.tmp`, JSON.stringify(store))
    renameSync(`${extrasFile()}.tmp`, extrasFile())
  } catch {
    // kept in memory
  }
  return fresh[kind] as ExtraStore['entries'][string][T]
}

const toGames = (api: Api) => (response: Raw[]) => response.map((r) => APIS[api].toGame(r, api)).filter((g): g is ExternalGame => !!g)
const finishedBefore = (games: ExternalGame[] | undefined, kickoff: string, count: number) =>
  (games ?? [])
    .filter((g) => g.state === 'finished' && g.homeScore !== undefined && g.awayScore !== undefined && g.kickoff < kickoff)
    .sort((x, y) => y.kickoff.localeCompare(x.kickoff))
    .slice(0, count)

/** The last meetings of the two teams in an API-Sports game, before its kickoff (cached for three days) */
export async function apiHeadToHead(game: ExternalGame, count = 5): Promise<ExternalGame[] | undefined> {
  const api = apiOf(game)
  const def = APIS[api]
  const a = game.home.id
  const b = game.away.id
  if (!def || !a || !b) return undefined
  const games = await cached(api, `${api}|${Math.min(a, b)}-${Math.max(a, b)}`, 3 * 86_400_000, def.h2h(a, b), 'games', toGames(api))
  return games ? finishedBefore(games, game.kickoff, count) : undefined
}

/** Reads a table: football's one list per group, or the v1 APIs' */
function readTable(response: Raw[]): TableRow[][] {
  const groups: Raw[][] = response[0]?.league?.standings ?? (Array.isArray(response[0]) ? response : [response])
  return groups.map((rows) =>
    (rows ?? []).map((r: Raw): TableRow => {
      const games = r.all ?? r.games ?? {}
      const count = (v: unknown) => (typeof v === 'number' ? v : Number((v as { total?: number } | null)?.total ?? 0))
      const goals = r.all?.goals ?? r.goals ?? (typeof r.points === 'object' ? r.points : undefined)
      return {
        rank: Number(r.rank ?? r.position ?? 0),
        teamId: num(r.team?.id),
        name: String(r.team?.name ?? ''),
        logo: r.team?.logo ?? undefined,
        played: count(games.played),
        won: count(games.win),
        drawn: games.draw !== undefined ? count(games.draw) : undefined,
        lost: count(games.lose),
        for: num(goals?.for),
        against: num(goals?.against),
        points: typeof r.points === 'number' ? r.points : undefined,
      }
    }),
  )
}

/** API-Sports' round names in Danish ("Regular Season - 7" -> "7. runde") */

/**
 * The match page's extras for an API-Sports game: facts from the game itself,
 * and (fetched, cached) the teams' latest results and the league table.
 */
export async function apiMatchExtra(game: ExternalGame): Promise<MatchExtra> {
  const api = apiOf(game)
  const def = APIS[api]
  const facts: MatchExtra['facts'] = []
  if (game.round) facts.push({ label: 'Runde', value: danishRound(game.round)! })
  if (game.stadium || game.venue) facts.push({ label: 'Spillested', value: [game.stadium, game.venue].filter((x, i, a) => x && a.indexOf(x) === i).join(', ') })
  if (game.referee) facts.push({ label: 'Dommer', value: game.referee.replace(/,.*$/, '') })
  if (game.ht) facts.push({ label: 'Pausestilling', value: `${game.ht[0]}–${game.ht[1]}` })
  if (!def) return { facts }

  const form = async (team?: number) =>
    team
      ? cached(api, `${api}|team|${team}|${game.league.season ?? ''}`, 12 * 3_600_000, def.teamGames?.(team, game.league.season), 'games', toGames(api))
      : undefined
  const [homeGames, awayGames, table] = await Promise.all([
    form(game.home.id).catch(() => undefined),
    form(game.away.id).catch(() => undefined),
    game.league.id
      ? cached(api, `${api}|table|${game.league.id}|${game.league.season ?? ''}`, 6 * 3_600_000, def.standings?.(game.league.id, game.league.season), 'table', readTable).catch(
          () => undefined,
        )
      : undefined,
  ])
  const toForm = (games: ExternalGame[] | undefined, team?: number): FormGame[] =>
    finishedBefore(games, game.kickoff, 5).map((g) => {
      const home = g.home.id === team
      return {
        date: g.kickoff,
        opponent: home ? g.away.name : g.home.name,
        home,
        for: (home ? g.homeScore : g.awayScore) ?? 0,
        against: (home ? g.awayScore : g.homeScore) ?? 0,
        competition: g.league.name,
      }
    })
  const extra: MatchExtra = { facts }
  const homeForm = toForm(homeGames, game.home.id)
  const awayForm = toForm(awayGames, game.away.id)
  if (homeForm.length || awayForm.length) extra.form = { home: homeForm, away: awayForm }
  // The group with either team in it
  const group = table?.find((rows) => rows.some((r) => r.teamId === game.home.id || r.teamId === game.away.id))
  if (group && group.length > 1) extra.table = { rows: group.map((r) => ({ ...r, logo: realLogo(r.logo) })), homeId: game.home.id, awayId: game.away.id, source: 'api-sports' }
  return extra
}

// ---------------------------------------------------------------- goals and cards of a football match

/**
 * Goals and cards of an API-Sports football match, for the match page's
 * timeline. Fetched again only when the score has changed since (a new goal)
 * and once more when the match is over (for late cards), so a live match
 * costs a request per goal, not per page view.
 */
export async function apiMatchEvents(game: ExternalGame): Promise<Incident[] | undefined> {
  const api = apiOf(game)
  if (api !== 'football' || game.state === 'upcoming' || game.state === 'postponed') return undefined
  const store = extrasStore()
  const key = `${api}|events|${game.id}`
  const entry = store.entries[key]
  const goals = (game.homeScore ?? 0) + (game.awayScore ?? 0)
  const counted = (entry?.incidents ?? []).filter((i) => i.kind !== 'yellow' && i.kind !== 'red').length
  const fresh = entry && counted === goals && (game.state !== 'finished' || entry.final)
  if (fresh || (entry && Date.now() - entry.fetchedAt < 60_000)) return entry.incidents
  if (!keyFor(api)) return entry?.incidents
  load()
  const s = mem.store[api]
  const remaining = s?.quotaDay === utcDay() ? (s.remaining ?? 100) : (s?.limit ?? 100)
  const spent = store.spent[api]?.day === utcDay() ? store.spent[api].count : 0
  if (remaining <= EXTRAS_KEEP_REMAINING || spent >= extrasPerDay(s)) return entry?.incidents
  store.spent[api] = { day: utcDay(), count: spent + 1 }
  const id = game.id.split('-').pop()
  const { response, error } = await call(api, `/fixtures/events?fixture=${id}`, 5_000)
  if (error) return entry?.incidents
  const incidents = toIncidents(response ?? [], game)
  store.entries[key] = { fetchedAt: Date.now(), incidents, final: game.state === 'finished' }
  try {
    mkdirSync(path.dirname(extrasFile()), { recursive: true })
    writeFileSync(`${extrasFile()}.tmp`, JSON.stringify(store))
    renameSync(`${extrasFile()}.tmp`, extrasFile())
  } catch {
    // kept in memory
  }
  return incidents
}

/** API-Sports' events (goals, cards) as our incidents */
function toIncidents(events: Raw[], game: Pick<ExternalGame, 'home' | 'away'>): Incident[] {
  const incidents: Incident[] = []
  for (const r of events) {
    const type = String(r.type ?? '').toLowerCase()
    const detail = String(r.detail ?? '').toLowerCase()
    const side = num(r.team?.id) === game.home.id ? 'home' : num(r.team?.id) === game.away.id ? 'away' : undefined
    const minute = Number(r.time?.elapsed ?? 0) + Number(r.time?.extra ?? 0)
    if (!side || !minute) continue
    const kind: Incident['kind'] | undefined =
      type === 'goal'
        ? /missed/.test(detail)
          ? undefined
          : /own/.test(detail)
            ? 'own-goal'
            : /penalty/.test(detail)
              ? 'penalty'
              : 'goal'
        : type === 'card'
          ? /red|second yellow/.test(detail)
            ? 'red'
            : 'yellow'
          : undefined
    // An own goal is registered to the player's team; our incidents count it for the other side the same way
    if (kind) incidents.push({ minute, side, kind, player: r.player?.name ?? undefined })
  }
  return incidents.sort((a, b) => a.minute - b.minute)
}

/** A refetched day keeps the goals and cards already fetched for its games (until the score changes) */
function keepEvents(before: ExternalGame[], after: ExternalGame[]): ExternalGame[] {
  const prev = new Map(before.map((g) => [g.id, g]))
  return after.map((g) => {
    const p = prev.get(g.id)
    return p?.incidents && !g.incidents ? { ...g, incidents: p.incidents, eventsFor: p.eventsFor } : g
  })
}

// ---------------------------------------------------------------- goals and cards for every game (paid plans)

/** What a game's goals and cards were fetched for: they are fetched again when this changes (live: also every 5 minutes, for the cards) */
const eventsKey = (g: ExternalGame) => `${g.state}|${g.homeScore ?? '-'}-${g.awayScore ?? '-'}${g.state === 'live' ? `|${Math.floor(Date.now() / 300_000)}` : ''}`

/**
 * Football games in our leagues and cups whose goals and cards are missing or
 * out of date (a finished game once, a live one when the score changes), up to
 * 20: API-Sports gives 20 games with their events in one request.
 */
function eventsDue(s: ApiState): string[] {
  const remaining = s.quotaDay === utcDay() ? (s.remaining ?? 100) : (s.limit ?? 100)
  if (!isPaid(s) || remaining <= PAID_RESERVE) return []
  const games = [...Object.values(s.days).flatMap((d) => d.games), ...Object.values(s.past ?? {}).flat()]
  const due = new Set<string>()
  // Live games first, then the newest finished ones
  const wanted = games
    .filter((g) => (g.state === 'live' || g.state === 'finished') && (divisionOfGame(g) || cupOfGame(g)) && g.eventsFor !== eventsKey(g))
    .sort((a, b) => (a.state === 'live' ? -1 : b.state === 'live' ? 1 : b.kickoff.localeCompare(a.kickoff)))
  for (const g of wanted) {
    due.add(g.id.split('-').pop()!)
    if (due.size >= 20) break
  }
  return [...due]
}

async function fetchEvents(api: Api, ids: string[]) {
  const s = mem.store[api]!
  const { response, error } = await call(api, `/fixtures?ids=${ids.join('-')}&${TZ}`)
  if (error) return
  const store = extrasStore()
  let statsChanged = false
  for (const r of response ?? []) {
    const id = `${api}-${r.fixture?.id}`
    const lists = [...Object.values(s.days).map((d) => d.games), ...Object.values(s.past ?? {})]
    for (const list of lists) {
      for (let i = 0; i < list.length; i++) {
        const g = list[i]
        if (g.id !== id) continue
        list[i] = { ...g, incidents: toIncidents(r.events ?? [], g), eventsFor: eventsKey(g) }
        // The line-ups come with them: saved for the match page
        const lineups = toLineups(r.lineups ?? [])
        if (lineups.length === 2) store.entries[`${api}|lineups|${id}`] = { fetchedAt: Date.now(), lineups, final: true }
        if (lineups.length === 2) statsChanged = true
        // The match statistics come with them: saved for the match page
        if (Array.isArray(r.statistics) && r.statistics.length) {
          const stats: Record<'home' | 'away', Record<string, string | number | null>> = { home: {}, away: {} }
          for (const t of r.statistics) {
            const side = num(t.team?.id) === g.home.id ? 'home' : num(t.team?.id) === g.away.id ? 'away' : undefined
            if (side) for (const x of t.statistics ?? []) stats[side][String(x.type)] = x.value ?? null
          }
          store.entries[`${api}|stats|${id}`] = { fetchedAt: Date.now(), stats, final: g.state === 'finished' }
          statsChanged = true
        }
      }
    }
  }
  // Games the answer left out are not asked for again and again
  for (const x of ids) {
    const id = `${api}-${x}`
    for (const list of [...Object.values(s.days).map((d) => d.games), ...Object.values(s.past ?? {})])
      for (let i = 0; i < list.length; i++) if (list[i].id === id && list[i].eventsFor !== eventsKey(list[i])) list[i] = { ...list[i], incidents: list[i].incidents ?? [], eventsFor: eventsKey(list[i]) }
  }
  if (statsChanged) {
    try {
      mkdirSync(path.dirname(extrasFile()), { recursive: true })
      writeFileSync(`${extrasFile()}.tmp`, JSON.stringify(store))
      renameSync(`${extrasFile()}.tmp`, extrasFile())
    } catch {
      // kept in memory
    }
  }
}

// ---------------------------------------------------------------- goals seen from the score

/** The minute a live game has reached: from its label ("78'"), else estimated from the kick-off */
function minuteNow(g: ExternalGame, now: number): number {
  const m = /^(\d+)(?:\+(\d+))?'/.exec(g.label ?? '')
  if (m) return Number(m[1]) + Number(m[2] ?? 0)
  const played = Math.round((now - Date.parse(g.kickoff)) / 60_000)
  // Past the first half, the 15-minute break is taken off
  return Math.max(1, Math.min(90, played > 47 ? played - 15 : played))
}

/**
 * When a football game's score has gone up since the last fetch, the goal is
 * logged for the side that scored, at the minute the game has reached now.
 * The goal came somewhere since the last check, so the minute is marked as
 * approximate. Used on the match page when no source gives the goals.
 */
function logGoals(s: ApiState, before: ExternalGame[], after: ExternalGame[]) {
  const prev = new Map(before.map((g) => [g.id, g]))
  const now = Date.now()
  for (const g of after) {
    const p = prev.get(g.id)
    if (g.sport !== 'soccer' || !p || g.homeScore === undefined || g.awayScore === undefined) continue
    const add = (side: Incident['side'], n: number) => {
      if (n <= 0) return
      const log = ((s.goalLog ??= {})[g.id] ??= { at: now, goals: [] })
      log.at = now
      for (let i = 0; i < n; i++) log.goals.push({ minute: minuteNow(g, now), side, kind: 'goal', approx: true })
    }
    add('home', g.homeScore - (p.homeScore ?? 0))
    add('away', g.awayScore - (p.awayScore ?? 0))
  }
  // Forgotten after a month
  for (const [id, log] of Object.entries(s.goalLog ?? {})) if (now - log.at > 30 * 86_400_000) delete s.goalLog![id]
}

/** Goals seen from the score changing, for a game (approximate minutes); undefined when none were seen */
export function observedGoals(game: ExternalGame): Incident[] | undefined {
  load()
  const log = mem.store[apiOf(game)]?.goalLog?.[game.id]
  if (!log?.goals.length) return undefined
  // Only while they add up to the score (a goal ruled out afterwards would leave one too many)
  const goals = (game.homeScore ?? 0) + (game.awayScore ?? 0)
  return log.goals.length <= goals ? log.goals : undefined
}

/** Team logos by team name, from every game API-Sports has sent (for tables we compute ourselves) */
export function teamLogos(): Map<string, string> {
  load()
  const holder = mem as typeof mem & { logos?: { version: string; map: Map<string, string> } }
  const version = `${mem.mtime}|${logoCheckVersion()}`
  if (holder.logos?.version === version) return holder.logos.map
  const map = new Map<string, string>()
  for (const s of Object.values(mem.store)) {
    const games = [...Object.values(s.days).flatMap((d) => d.games), ...Object.values(s.past ?? {}).flat()]
    for (const g of games) for (const t of [g.home, g.away]) if (realLogo(t.logo) && !map.has(t.name)) map.set(t.name, t.logo!)
  }
  holder.logos = { version, map }
  return map
}

/** Every logo address API-Sports has given, today's games first (for the placeholder check) */
export function apiSportsLogoUrls(): string[] {
  load()
  const today = new Date().toISOString().slice(0, 10)
  const urls = new Set<string>()
  const add = (g: ExternalGame) => [g.home.logo, g.away.logo, g.league.logo].forEach((u) => u && urls.add(u))
  for (const s of Object.values(mem.store)) s.days[today]?.games.forEach(add)
  for (const s of Object.values(mem.store)) {
    for (const d of Object.values(s.days)) d.games.forEach(add)
    for (const games of Object.values(s.past ?? {})) games.forEach(add)
    for (const l of Object.values(s.leagues ?? {})) if (l.logo) urls.add(l.logo)
  }
  return [...urls]
}

// ---------------------------------------------------------------- every league API-Sports has

export interface CatalogLeague {
  id: string
  name: string
  /** "League" or "Cup" */
  type: string
  country: string
  logo?: string
  season?: number
  /** What API-Sports has for the current season */
  coverage: { events: boolean; lineups: boolean; statistics: boolean; players: boolean; standings: boolean; topScorers: boolean; odds: boolean }
  /** Whether our job keeps its games (ours, a cup we follow, or let through by `keep`) */
  followed: boolean
  /** Our league, when it is one */
  ours?: string
}

/** Every football league and cup API-Sports has this season, with what it covers (one request a day) */
export async function apiLeagueCatalog(): Promise<{ leagues: CatalogLeague[]; fetchedAt?: number; error?: string }> {
  const api: Api = 'football'
  const store = extrasStore()
  const key = `${api}|catalog`
  const entry = store.entries[key]
  if (entry?.catalog && Date.now() - entry.fetchedAt < 24 * 3_600_000) return { leagues: entry.catalog, fetchedAt: entry.fetchedAt }
  if (!keyFor(api)) return { leagues: entry?.catalog ?? [], fetchedAt: entry?.fetchedAt, error: 'Ingen API-Sports-nøgle på serveren' }
  const { response, error } = await call(api, '/leagues?current=true')
  if (error) return { leagues: entry?.catalog ?? [], fetchedAt: entry?.fetchedAt, error }
  const leagues: CatalogLeague[] = (response ?? []).map((r) => {
    const season = (r.seasons ?? []).find((x: Raw) => x.current) ?? r.seasons?.[0]
    const c = season?.coverage ?? {}
    const probe: ExternalGame = {
      id: `${api}-0`,
      sport: 'soccer',
      league: { id: String(r.league?.id ?? ''), name: String(r.league?.name ?? ''), country: r.country?.name ?? undefined },
      home: { name: '' },
      away: { name: '' },
      kickoff: new Date().toISOString(),
      state: 'upcoming',
    }
    const ours = divisionOfGame(probe)?.d
    return {
      id: probe.league.id,
      name: probe.league.name,
      type: String(r.league?.type ?? ''),
      country: String(r.country?.name ?? ''),
      logo: realLogo(r.league?.logo ?? undefined),
      season: season?.year != null ? Number(season.year) : undefined,
      coverage: {
        events: !!c.fixtures?.events,
        lineups: !!c.fixtures?.lineups,
        statistics: !!c.fixtures?.statistics_fixtures,
        players: !!c.fixtures?.statistics_players,
        standings: !!c.standings,
        topScorers: !!c.top_scorers,
        odds: !!c.odds,
      },
      followed: !!ours || !!cupOfGame(probe) || APIS[api].keep(probe),
      ours: ours?.name,
    }
  })
  store.entries[key] = { fetchedAt: Date.now(), catalog: leagues }
  try {
    mkdirSync(path.dirname(extrasFile()), { recursive: true })
    writeFileSync(`${extrasFile()}.tmp`, JSON.stringify(store))
    renameSync(`${extrasFile()}.tmp`, extrasFile())
  } catch {
    // kept in memory
  }
  return { leagues, fetchedAt: Date.now() }
}

// ---------------------------------------------------------------- match statistics and expected goals

const STAT_ROWS: [string, string][] = [
  ['Ball Possession', 'Boldbesiddelse'],
  ['Total Shots', 'Skud i alt'],
  ['Shots on Goal', 'Skud på mål'],
  ['Shots off Goal', 'Skud forbi mål'],
  ['Blocked Shots', 'Blokerede skud'],
  ['Shots insidebox', 'Skud i feltet'],
  ['Shots outsidebox', 'Skud uden for feltet'],
  ['Corner Kicks', 'Hjørnespark'],
  ['Offsides', 'Offside'],
  ['Goalkeeper Saves', 'Redninger'],
  ['Total passes', 'Afleveringer'],
  ['Passes accurate', 'Præcise afleveringer'],
  ['Passes %', 'Afleveringspræcision'],
  ['Fouls', 'Frispark begået'],
  ['Yellow Cards', 'Gule kort'],
  ['Red Cards', 'Røde kort'],
]

/**
 * A football match's statistics (shots, possession, corners …) with expected
 * goals: API-Sports' own xG where they have it (the big leagues), else our
 * estimate from the shots. Fetched every 5 minutes while live and once when
 * final, within the same daily budget as the other extras. The free plan
 * doesn't give statistics, so this is empty until a paid plan.
 */
export async function apiMatchStats(game: ExternalGame, incidents?: Incident[]): Promise<MatchStats | undefined> {
  const api = apiOf(game)
  if (api !== 'football' || game.state === 'upcoming' || game.state === 'postponed') return undefined
  const store = extrasStore()
  const key = `${api}|stats|${game.id}`
  let entry = store.entries[key]
  const fresh = entry && (entry.final || (game.state !== 'finished' && Date.now() - entry.fetchedAt < 5 * 60_000))
  if (!fresh && keyFor(api) && !(entry && Date.now() - entry.fetchedAt < 60_000)) {
    load()
    const s = mem.store[api]
    const remaining = s?.quotaDay === utcDay() ? (s.remaining ?? 100) : (s?.limit ?? 100)
    const spent = store.spent[api]?.day === utcDay() ? store.spent[api].count : 0
    if (remaining > EXTRAS_KEEP_REMAINING && spent < extrasPerDay(s)) {
      store.spent[api] = { day: utcDay(), count: spent + 1 }
      const { response, error } = await call(api, `/fixtures/statistics?fixture=${game.id.split('-').pop()}`, 5_000)
      if (!error) {
        const stats: NonNullable<typeof entry>['stats'] = { home: {}, away: {} }
        for (const r of response ?? []) {
          const side = num(r.team?.id) === game.home.id ? 'home' : num(r.team?.id) === game.away.id ? 'away' : undefined
          if (side) for (const x of r.statistics ?? []) stats[side][String(x.type)] = x.value ?? null
        }
        entry = store.entries[key] = { fetchedAt: Date.now(), stats, final: game.state === 'finished' }
        try {
          mkdirSync(path.dirname(extrasFile()), { recursive: true })
          writeFileSync(`${extrasFile()}.tmp`, JSON.stringify(store))
          renameSync(`${extrasFile()}.tmp`, extrasFile())
        } catch {
          // kept in memory
        }
      }
    }
  }
  const stats = entry?.stats
  if (!stats || !Object.keys(stats.home).length || !Object.keys(stats.away).length) return undefined
  const value = (side: 'home' | 'away', type: string) => {
    const v = stats[side][type]
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number.parseFloat(v) : NaN
    return Number.isFinite(n) ? n : undefined
  }
  const rows: MatchStats['rows'] = []
  for (const [type, label] of STAT_ROWS) {
    const home = value('home', type)
    const away = value('away', type)
    if (home === undefined || away === undefined) continue
    const pct = type === 'Ball Possession' || type === 'Passes %'
    rows.push({ label, home, away, ...(pct && { homeText: `${home} %`, awayText: `${away} %` }) })
  }
  let xg: MatchStats['xg']
  const theirs = [value('home', 'expected_goals'), value('away', 'expected_goals')]
  if (theirs[0] !== undefined && theirs[1] !== undefined) xg = { home: theirs[0], away: theirs[1], source: 'api-sports' }
  else {
    const inside = [value('home', 'Shots insidebox'), value('away', 'Shots insidebox')]
    const outside = [value('home', 'Shots outsidebox'), value('away', 'Shots outsidebox')]
    if (inside.every((v) => v !== undefined) && outside.every((v) => v !== undefined)) {
      // Penalties scored are known from the goals; missed ones aren't, and count as shots in the box
      const pens = (side: 'home' | 'away') => (incidents ?? []).filter((i) => i.kind === 'penalty' && i.side === side).length
      xg = { home: estimateXg(inside[0]!, outside[0]!, pens('home')), away: estimateXg(inside[1]!, outside[1]!, pens('away')), source: 'scoreline' }
    }
  }
  return rows.length || xg ? { rows, xg } : undefined
}

// ---------------------------------------------------------------- line-ups and the league's best players

function toLineups(response: Raw[]): Lineup[] {
  return response.map((t) => ({
    team: String(t.team?.name ?? ''),
    formation: t.formation ?? undefined,
    coach: t.coach?.name ?? undefined,
    startXI: (t.startXI ?? []).map((x: Raw) => ({ name: String(x.player?.name ?? ''), number: num(x.player?.number), pos: x.player?.pos ?? undefined, grid: x.player?.grid ?? undefined })),
    substitutes: (t.substitutes ?? []).map((x: Raw) => ({ name: String(x.player?.name ?? ''), number: num(x.player?.number), pos: x.player?.pos ?? undefined })),
  }))
}

function saveExtras() {
  try {
    mkdirSync(path.dirname(extrasFile()), { recursive: true })
    writeFileSync(`${extrasFile()}.tmp`, JSON.stringify(extrasStore()))
    renameSync(`${extrasFile()}.tmp`, extrasFile())
  } catch {
    // kept in memory
  }
}

/**
 * A football match's line-ups, home team first: saved with the goals and
 * cards, else looked up (they come about an hour before kick-off; asked again
 * every 10 minutes until then).
 */
export async function apiMatchLineups(game: ExternalGame): Promise<Lineup[] | undefined> {
  const api = apiOf(game)
  if (api !== 'football' || game.state === 'postponed') return undefined
  const store = extrasStore()
  const key = `${api}|lineups|${game.id}`
  let entry = store.entries[key]
  const soon = Date.parse(game.kickoff) - Date.now() < 90 * 60_000
  const due = !entry?.lineups?.length && soon && !(entry && Date.now() - entry.fetchedAt < 10 * 60_000)
  if (due && keyFor(api)) {
    load()
    const s = mem.store[api]
    const remaining = s?.quotaDay === utcDay() ? (s.remaining ?? 100) : (s?.limit ?? 100)
    const spent = store.spent[api]?.day === utcDay() ? store.spent[api].count : 0
    if (remaining > EXTRAS_KEEP_REMAINING && spent < extrasPerDay(s)) {
      store.spent[api] = { day: utcDay(), count: spent + 1 }
      const { response, error } = await call(api, `/fixtures/lineups?fixture=${game.id.split('-').pop()}`, 5_000)
      if (!error) {
        entry = store.entries[key] = { fetchedAt: Date.now(), lineups: toLineups(response ?? []) }
        saveExtras()
      }
    }
  }
  const lineups = entry?.lineups
  if (!lineups || lineups.length !== 2) return undefined
  // Home team first
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
  return same(lineups[1].team, game.home.name) && !same(lineups[0].team, game.home.name) ? [lineups[1], lineups[0]] : lineups
}

/** API-Sports' id for one of our leagues (known, or learned from its games) */
export function apiLeagueIdOf(divisionId: string): string | undefined {
  load()
  return FOOTBALL_IDS[divisionId] ?? mem.store.football?.leagueIds?.[divisionId]
}

/** A league's top scorers, assists and cards this season (four requests, kept 6 hours; paid plans) */
export async function apiLeagueLeaders(leagueId: string, season = SEASON.slice(0, 4)): Promise<Leaders | undefined> {
  const entry = extrasStore().entries[`football|leaders|${leagueId}|${season}`]
  if (entry?.leaders && Date.now() - entry.fetchedAt < 6 * 3_600_000) return entry.leaders
  // Stale: shown while new lists are fetched in the background; nothing yet: fetched now
  const fresh = fetchLeaders(leagueId, season).catch(() => undefined)
  return entry?.leaders ?? (await fresh)
}

const leadersRunning = new Set<string>()
async function fetchLeaders(leagueId: string, season: string): Promise<Leaders | undefined> {
  const api: Api = 'football'
  const store = extrasStore()
  const key = `${api}|leaders|${leagueId}|${season}`
  const entry = store.entries[key]
  if (leadersRunning.has(key)) return entry?.leaders
  leadersRunning.add(key)
  try {
    return await fetchLeadersNow(api, key, leagueId, season)
  } finally {
    leadersRunning.delete(key)
  }
}

async function fetchLeadersNow(api: Api, key: string, leagueId: string, season: string): Promise<Leaders | undefined> {
  const store = extrasStore()
  const entry = store.entries[key]
  load()
  const s = mem.store[api]
  if (!keyFor(api) || !isPaid(s)) return entry?.leaders
  const remaining = s?.quotaDay === utcDay() ? (s.remaining ?? 0) : (s?.limit ?? 0)
  if (remaining <= PAID_RESERVE) return entry?.leaders
  const read = (response: Raw[], value: (st: Raw) => number): LeaderRow[] =>
    response
      .map((r) => {
        const st = r.statistics?.[0] ?? {}
        return {
          name: String(r.player?.name ?? ''),
          photo: r.player?.photo ?? undefined,
          team: String(st.team?.name ?? ''),
          teamLogo: realLogo(st.team?.logo ?? undefined),
          games: num(st.games?.appearences),
          value: value(st),
        }
      })
      .filter((r) => r.name && r.value > 0)
      .slice(0, 10)
  const get = async (path: string) => (await call(api, `/players/${path}?league=${leagueId}&season=${season}`, 8_000)).response
  const [scorers, assists, yellow, red] = await Promise.all([get('topscorers'), get('topassists'), get('topyellowcards'), get('topredcards')])
  if (!scorers && !assists) return entry?.leaders
  const leaders: Leaders = {
    scorers: read(scorers ?? [], (st) => Number(st.goals?.total ?? 0)),
    assists: read(assists ?? [], (st) => Number(st.goals?.assists ?? 0)),
    yellow: read(yellow ?? [], (st) => Number(st.cards?.yellow ?? 0)),
    red: read(red ?? [], (st) => Number(st.cards?.red ?? 0) + Number(st.cards?.yellowred ?? 0)),
  }
  store.entries[key] = { fetchedAt: Date.now(), leaders }
  saveExtras()
  return leaders
}

/**
 * API-Sports' game for a match on our pages, from every game the job has kept
 * (the whole season, not only the days around today): the same id, else the
 * same day with both teams alike, else one team alike and only one such game.
 */
export function apiGameFor(match: { id: string; sport: SportId; kickoff: Date; home: { name: string }; away: { name: string } }, names?: { home: string[]; away: string[] }): ExternalGame | undefined {
  load()
  const day = isoDate(match.kickoff)
  const games: ExternalGame[] = []
  for (const s of Object.values(mem.store)) {
    for (const d of Object.values(s.days)) for (const g of d.games) games.push(g)
    for (const list of Object.values(s.past ?? {})) for (const g of list) games.push(g)
  }
  const direct = games.find((g) => g.id === match.id)
  if (direct) return direct
  const same = games.filter((g) => g.sport === match.sport && isoDate(new Date(g.kickoff)) === day)
  const home = names?.home ?? [match.home.name]
  const away = names?.away ?? [match.away.name]
  const both = same.find((g) => alike(home, g.home.name) && alike(away, g.away.name))
  if (both) return both
  const either = [...new Map(same.filter((g) => alike(home, g.home.name) || alike(away, g.away.name)).map((g) => [g.id, g])).values()]
  return either.length === 1 ? either[0] : undefined
}
