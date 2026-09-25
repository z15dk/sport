import 'server-only'
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { MatchState, SportId } from '../types'
import type { ExternalGame } from '../data/external'
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
}

const TZ = 'timezone=Europe/Copenhagen'
const num = (v: unknown) => (v === null || v === undefined || v === '' ? undefined : Number(v))
const total = (v: unknown) => (typeof v === 'number' ? v : num((v as { total?: unknown } | null)?.total))

const FINISHED = new Set(['FT', 'AET', 'PEN', 'AOT', 'AP', 'AW'])
const OFF = new Set(['PST', 'CANC', 'ABD', 'SUSP', 'AWD', 'WO', 'INT'])
const UPCOMING = new Set(['NS', 'TBD'])
function stateOf(short: string): MatchState {
  if (FINISHED.has(short)) return 'finished'
  if (OFF.has(short)) return 'postponed'
  if (UPCOMING.has(short) || !short) return 'upcoming'
  return 'live'
}
const PERIOD_LABEL: Record<string, string> = { HT: 'Pause', BT: 'Pause', P: 'Straffe', OT: 'Forl.', Q1: '1. kvt.', Q2: '2. kvt.', Q3: '3. kvt.', Q4: '4. kvt.', P1: '1. periode', P2: '2. periode', P3: '3. periode' }

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
      league: { id: String(r.league?.id ?? ''), name: String(r.league?.name ?? ''), country: r.country?.name, logo: r.league?.logo ?? undefined },
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
    toGame: (r, api) => {
      if (!r?.fixture?.id) return undefined
      const short = String(r.fixture.status?.short ?? '')
      const state = stateOf(short)
      const elapsed = r.fixture.status?.elapsed
      return {
        id: `${api}-${r.fixture.id}`,
        sport: 'soccer',
        league: { id: String(r.league?.id ?? ''), name: String(r.league?.name ?? ''), country: r.league?.country, logo: r.league?.logo ?? undefined },
        home: { name: r.teams.home.name, logo: r.teams.home.logo ?? undefined, id: num(r.teams.home.id) },
        away: { name: r.teams.away.name, logo: r.teams.away.logo ?? undefined, id: num(r.teams.away.id) },
        kickoff: new Date(Number(r.fixture.timestamp) * 1000).toISOString(),
        state,
        label: state === 'live' ? (PERIOD_LABEL[short] ?? (elapsed ? `${elapsed}'` : short)) : undefined,
        homeScore: num(r.goals?.home),
        awayScore: num(r.goals?.away),
        venue: r.fixture.venue?.city ?? r.fixture.venue?.name ?? undefined,
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

async function fetchDay(api: Api, date: string) {
  const def = APIS[api]
  const s = (mem.store[api] ??= { days: {} })
  const { response, error } = await call(api, def.path(date))
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
  if (age(yesterday) > 6 * 3_600_000) return yesterday
  for (const d of window(today).slice(2)) if (age(d) > (d === addDays(today, 1) ? 3 : 12) * 3_600_000) return d
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
      if (error) {
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
    }
  })
}

// ---------------------------------------------------------------- head-to-head

interface H2hStore {
  entries: Record<string, { fetchedAt: number; games: ExternalGame[] }>
  /** Requests spent on head-to-heads per API and UTC day */
  spent: Record<string, { day: string; count: number }>
}
const H2H_TTL_MS = 3 * 86_400_000
const H2H_PER_DAY = 25
const H2H_KEEP_REMAINING = 20
const h2hFile = (): string => process.env.H2H_FILE ?? path.join(/*turbopackIgnore: true*/ cacheDir(), 'h2h.json')
const h2hHolder = globalThis as { __scorelineH2h?: H2hStore }
function h2hStore(): H2hStore {
  if (!h2hHolder.__scorelineH2h) {
    try {
      h2hHolder.__scorelineH2h = JSON.parse(readFileSync(h2hFile(), 'utf8')) as H2hStore
    } catch {
      h2hHolder.__scorelineH2h = { entries: {}, spent: {} }
    }
  }
  return h2hHolder.__scorelineH2h
}

/**
 * The last meetings of the two teams in an API-Sports game, before its kickoff.
 * From the cache when fetched within three days; otherwise one request, when
 * the day's quota allows it (at most 25 a day, never below 20 requests left).
 */
export async function apiHeadToHead(game: ExternalGame, count = 5): Promise<ExternalGame[] | undefined> {
  const api = game.id.split('-').slice(0, -1).join('-') as Api
  const def = APIS[api]
  const a = game.home.id
  const b = game.away.id
  if (!def || !a || !b || !keyFor(api)) return undefined
  const store = h2hStore()
  const key = `${api}|${Math.min(a, b)}-${Math.max(a, b)}`
  let entry = store.entries[key]
  if (!entry || Date.now() - entry.fetchedAt > H2H_TTL_MS) {
    load()
    const s = mem.store[api]
    const remaining = s?.quotaDay === utcDay() ? (s.remaining ?? 100) : (s?.limit ?? 100)
    const spent = store.spent[api]?.day === utcDay() ? store.spent[api].count : 0
    if (remaining <= H2H_KEEP_REMAINING || spent >= H2H_PER_DAY) return entry?.games.length ? pick(entry.games) : undefined
    store.spent[api] = { day: utcDay(), count: spent + 1 }
    const { response, error } = await call(api, def.h2h(a, b), 5_000)
    if (error) return entry?.games.length ? pick(entry.games) : undefined
    entry = { fetchedAt: Date.now(), games: (response ?? []).map((r) => def.toGame(r, api)).filter((g): g is ExternalGame => !!g) }
    store.entries[key] = entry
    try {
      mkdirSync(path.dirname(h2hFile()), { recursive: true })
      writeFileSync(`${h2hFile()}.tmp`, JSON.stringify(store))
      renameSync(`${h2hFile()}.tmp`, h2hFile())
    } catch {
      // kept in memory
    }
  }
  return pick(entry.games)

  function pick(games: ExternalGame[]) {
    return games
      .filter((g) => g.state === 'finished' && g.homeScore !== undefined && g.kickoff < game.kickoff)
      .sort((x, y) => y.kickoff.localeCompare(x.kickoff))
      .slice(0, count)
  }
}
