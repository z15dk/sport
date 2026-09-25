import 'server-only'
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { MatchState, SportId } from '../types'
import type { ExternalGame } from '../data/external'
import { addDays, isoDate } from './time'
import { cacheDir } from './tsdb'

// Games from API-Sports: football, basketball, NBA, ice hockey, handball,
// volleyball and NFL. Keys go in the server's environment: API_SPORTS_KEY for
// all sports, or API_SPORTS_KEY_<API> (e.g. API_SPORTS_KEY_NBA) per sport.
//
// Each API allows 100 requests a day on the free plan. One request fetches
// every game of one day, so the job fetches yesterday to ten days ahead a
// few times a day and spends the rest on today, more often while games are
// on. The remaining requests come from API-Sports' own response headers.
// Everything is kept in apisports.json, so a restart costs no requests.

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
      home: { name: r.teams.home.name, logo: r.teams.home.logo ?? undefined },
      away: { name: r.teams.away.name, logo: r.teams.away.logo ?? undefined },
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
    toGame: (r, api) => {
      if (!r?.fixture?.id) return undefined
      const short = String(r.fixture.status?.short ?? '')
      const state = stateOf(short)
      const elapsed = r.fixture.status?.elapsed
      return {
        id: `${api}-${r.fixture.id}`,
        sport: 'soccer',
        league: { id: String(r.league?.id ?? ''), name: String(r.league?.name ?? ''), country: r.league?.country, logo: r.league?.logo ?? undefined },
        home: { name: r.teams.home.name, logo: r.teams.home.logo ?? undefined },
        away: { name: r.teams.away.name, logo: r.teams.away.logo ?? undefined },
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
    toGame: (r, api) => {
      if (!r?.id || !r.teams?.home?.name) return undefined
      const status = Number(r.status?.short)
      const state: MatchState = status === 3 ? 'finished' : status === 2 ? 'live' : 'upcoming'
      return {
        id: `${api}-${r.id}`,
        sport: 'basketball',
        league: { id: 'standard', name: 'NBA', country: 'USA' },
        home: { name: r.teams.home.name, logo: r.teams.home.logo ?? undefined },
        away: { name: r.teams.visitors.name, logo: r.teams.visitors.logo ?? undefined },
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
    toGame: (r, api) => {
      const game = r?.game
      if (!game?.id || !r.teams?.home?.name) return undefined
      const short = String(game.status?.short ?? '')
      const state = stateOf(short)
      return {
        id: `${api}-${game.id}`,
        sport: 'american_football',
        league: { id: String(r.league?.id ?? ''), name: String(r.league?.name ?? ''), country: r.league?.country?.name, logo: r.league?.logo ?? undefined },
        home: { name: r.teams.home.name, logo: r.teams.home.logo ?? undefined },
        away: { name: r.teams.away.name, logo: r.teams.away.logo ?? undefined },
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

const keyFor = (api: Api) =>
  process.env[`API_SPORTS_KEY_${api.replace('-', '_').toUpperCase()}`]?.trim() || process.env.API_SPORTS_KEY?.trim() || undefined

// ---------------------------------------------------------------- the cache file

interface DayData {
  fetchedAt: number
  games: ExternalGame[]
}
interface ApiState {
  days: Record<string, DayData>
  remaining?: number
  limit?: number
  /** UTC date the remaining count belongs to (the quota resets at 00:00 UTC) */
  quotaDay?: string
  lastError?: string
  lastErrorAt?: number
  requests?: number
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

// ---------------------------------------------------------------- fetching

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const utcDay = () => new Date().toISOString().slice(0, 10)
const msUntilReset = () => {
  const d = new Date()
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - d.getTime()
}

async function fetchDay(api: Api, date: string) {
  const def = APIS[api]
  const s = (mem.store[api] ??= { days: {} })
  s.requests = (s.requests ?? 0) + 1
  try {
    // API_SPORTS_BASE points every API elsewhere (for tests)
    const base = process.env.API_SPORTS_BASE ? `${process.env.API_SPORTS_BASE}/${api}` : def.base
    const res = await fetch(base + def.path(date), {
      headers: { 'x-apisports-key': keyFor(api)! },
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
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
    if (!res.ok || errors.length) {
      s.lastError = `${res.status} ${errors.join('; ') || res.statusText}`
      s.lastErrorAt = Date.now()
      // Do not ask for this day again right away
      s.days[date] = { fetchedAt: Date.now(), games: s.days[date]?.games ?? [] }
      return
    }
    const games = (body.response ?? []).map((r) => def.toGame(r, api)).filter((g): g is ExternalGame => !!g && def.keep(g))
    s.days[date] = { fetchedAt: Date.now(), games }
    s.lastError = undefined
  } catch (err) {
    s.lastError = (err as Error).message
    s.lastErrorAt = Date.now()
  }
}

/** The day of this API most in need of a refresh, or nothing when the quota is spent */
function dueDay(api: Api, now: number): string | undefined {
  const s = mem.store[api] ?? { days: {} }
  const remaining = s.quotaDay === utcDay() ? (s.remaining ?? 100) : (s.limit ?? 100)
  if (remaining <= 2) return undefined
  // Wait an hour after an error (a plan restriction or a wrong key would repeat)
  if (s.lastErrorAt && now - s.lastErrorAt < 3_600_000) return undefined
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
    // Forget days that have left the window
    const oldest = addDays(isoDate(now), -3)
    for (const s of Object.values(mem.store)) for (const d of Object.keys(s.days)) if (d < oldest) delete s.days[d]
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
      games: new Set(games.map((g) => g.id)).size,
      leagues: [...new Set(games.map((g) => `${g.league.name}${g.league.country ? ` (${g.league.country})` : ''}`))].sort(),
      todayFetchedAt: fetchedToday ? new Date(fetchedToday).toISOString() : null,
      lastError: s?.lastError ?? null,
    }
  })
}
