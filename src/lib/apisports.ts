import 'server-only'
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { MatchState, SportId } from '../types'
import type { ExternalGame } from '../data/external'
import type { FormGame, MatchExtra, TableRow } from '../data/matchExtra'
import { addDays, isoDate } from './time'
import { cacheDir } from './tsdb'
import { createHash } from 'node:crypto'
import { divisionOfGame } from '../data/ourLeagues'

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
          Italy: /^(Serie A|Coppa Italia)$/,
          France: /^(Ligue 1)$/,
          Sweden: /^(Allsvenskan|Superettan|Svenska Cupen)$/,
          Norway: /^(Eliteserien|OBOS-ligaen|1\. Division|NM Cupen)$/,
          Netherlands: /^(Eredivisie)$/,
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
interface ApiState {
  days: Record<string, DayData>
  /** Finished games in our leagues, by day, kept after the day leaves the window */
  past?: Record<string, ExternalGame[]>
  /** Days before the window fetched once for the past games */
  backfilled?: Record<string, number>
  /** Days the plan gives access to, relative to today (the free plan: yesterday to tomorrow) */
  allowedDays?: { from: number; to: number }
  remaining?: number
  limit?: number
  /** UTC date the remaining count belongs to (the quota resets at 00:00 UTC) */
  quotaDay?: string
  lastError?: string
  lastErrorAt?: number
  requests?: number
  /** Fingerprint of the key the error came with; a new key is tried right away */
  keyFingerprint?: string
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

const inOurLeague = (g: ExternalGame) => g.state === 'finished' && g.homeScore !== undefined && !!divisionOfGame(g)

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
  s.days[date] = { fetchedAt: Date.now(), games }
  s.lastError = undefined
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
  const todayEvery = busy ? Math.max(5 * 60_000, msUntilReset() / Math.max(1, remaining - 14)) : 60 * 60_000
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
      const day = dueDay(api, now)
      if (!day) continue
      // NBA dates are UTC: Danish evenings in the US fall on the next UTC day
      await fetchDay(api, day)
      changed = true
      await sleep(2_000)
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
  void tick()
  setInterval(() => void tick(), 60_000).unref()
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
    }
  })
}

// ---------------------------------------------------------------- match page extras
// Head-to-head, the teams' latest games and the league table, fetched when a
// match page is first viewed and cached (h2h.json). They share a small daily
// budget per API and are never fetched when the day's quota runs low.

interface ExtraStore {
  entries: Record<string, { fetchedAt: number; games?: ExternalGame[]; table?: TableRow[][] }>
  /** Requests spent on extras per API and UTC day */
  spent: Record<string, { day: string; count: number }>
}
const EXTRAS_PER_DAY = 30
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
  if (remaining <= EXTRAS_KEEP_REMAINING || spent >= EXTRAS_PER_DAY) return entry?.[kind]
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
function roundLabel(round: string) {
  const m = /^(.*?)\s*-\s*(\d+)$/.exec(round)
  const stage: Record<string, string> = { 'Regular Season': '', 'League Stage': 'Ligafase, ', 'Group Stage': 'Gruppespil, ', Qualifying: 'Kvalifikation, ' }
  if (/^\d+$/.test(round)) return `${round}. runde`
  if (m && m[1] in stage) return `${stage[m[1]]}${m[2]}. runde`
  const words: Record<string, string> = { 'Round of 16': 'Ottendedelsfinale', 'Quarter-finals': 'Kvartfinale', 'Semi-finals': 'Semifinale', Final: 'Finale' }
  return words[round] ?? round
}

/**
 * The match page's extras for an API-Sports game: facts from the game itself,
 * and (fetched, cached) the teams' latest results and the league table.
 */
export async function apiMatchExtra(game: ExternalGame): Promise<MatchExtra> {
  const api = apiOf(game)
  const def = APIS[api]
  const facts: MatchExtra['facts'] = []
  if (game.round) facts.push({ label: 'Runde', value: roundLabel(game.round) })
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
  if (group && group.length > 1) extra.table = { rows: group, homeId: game.home.id, awayId: game.away.id, source: 'api-sports' }
  return extra
}
