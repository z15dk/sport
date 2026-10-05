import 'server-only'
import { spendingBlocked } from './visitorBudget'
import { runsJobs } from './role'
import { timed } from './slow'
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Incident, MatchState, PeriodScore, SportId } from '../types'
import { danishLeagueName, danishRound, externalLeagueKey, isWomenGame, type ExternalGame } from '../data/external'
import { shownTeam } from '../data/countries'
import { alike } from '../data/aliases'
import { normalize } from '../data/aliases'
import { estimateXg, lineupSpelling, type FormGame, type Leaders, type LeaderRow, type Lineup, type LineupPlayer, type MatchExtra, type MatchStats, type Substitution, type TableRow } from '../data/matchExtra'
import { addDays, isoDate } from './time'
import { cacheDir } from './tsdb'
import { logoCheckVersion, realLogo } from './logoCheck'
import { proxyImage } from './imageProxy'
import { cupOfGame, wholeSeason } from '../data/cups'
import { followChoice, leagueFollowChoices } from './leagueFollow'
import { createHash } from 'node:crypto'
import { divisionOfGame } from '../data/ourLeagues'
import { DIVISIONS, SEASON, sportOf, type Division } from '../data/leagues'
import type { PlayerData, PlayerSeasonRow } from '../data/player'
import type { Injury, Periods, TeamStats } from '../data/teamStats'
import { archiveEvents, archiveMissingEvents, archiveMissingPlayers, archivePlayerGames, archiveSeason, type PlayerGame } from './archive'
import { checkSeason } from './seasonCheck'
import { kvStore, type KvStore } from './extrasDb'

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
const PERIOD_LABEL: Record<string, string> = { ET: 'Forl.', PT: 'Straffe', LIVE: 'Live', HT: 'Pause', BT: 'Pause', P: 'Straffe', OT: 'Forl.', Q1: '1. kvt.', Q2: '2. kvt.', Q3: '3. kvt.', Q4: '4. kvt.', P1: '1. periode', P2: '2. periode', P3: '3. periode', S1: '1. sæt', S2: '2. sæt', S3: '3. sæt', S4: '4. sæt', S5: '5. sæt' }

/** Youth and reserve teams are left out everywhere */
const notYouth = (g: ExternalGame) => !/\bU\s?\d{2}\b|youth|reserve|junior/i.test(g.league.name)
function leagues(byCountry: Record<string, RegExp>) {
  return (g: ExternalGame) => {
    if (!notYouth(g)) return false
    const rule = byCountry[g.league.country ?? '']
    return !!rule && rule.test(g.league.name)
  }
}

/** A live game's status: its quarter, period or set, with the clock when the source gives one */
function liveLabel(short: string, timer: unknown): string {
  const period = /^(Q[1-4]|P[1-3]|S[1-5])$/.test(short) ? PERIOD_LABEL[short] : undefined
  const clock = timer != null && timer !== '' ? `${timer}'` : undefined
  if (period) return clock ? `${period} ${clock}` : period
  return clock ?? PERIOD_LABEL[short] ?? short
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
      // The quarter or period first (basketball's and hockey's clock runs within it): "2. kvt. 6'"; handball's is the match's minute
      label: state === 'live' ? liveLabel(short, r.status?.timer) : undefined,
      homeScore: total(r.scores?.home),
      awayScore: total(r.scores?.away),
      periods: periodsOf(sport, r),
    }
  }
}

/**
 * The score of each set, period, half or quarter from the v1 format: volleyball
 * and handball have periods.first … as {home, away}, ice hockey "1-0" strings,
 * basketball the quarters in scores.home/away. Only the ones played (or being played).
 */
function periodsOf(sport: SportId, r: Raw): PeriodScore[] | undefined {
  const out: PeriodScore[] = []
  const pair = (label: string, h: unknown, a: unknown) => {
    const home = num(h)
    const away = num(a)
    if (home !== undefined && away !== undefined) out.push({ label, home, away })
  }
  if (sport === 'volleyball' || sport === 'handball') {
    const names = ['first', 'second', 'third', 'fourth', 'fifth']
    names.forEach((k, i) => {
      const p = r.periods?.[k]
      if (p) pair(sport === 'volleyball' ? `${i + 1}. sæt` : `${i + 1}. halvleg`, p.home, p.away)
    })
    for (const [k, label] of [['extra', 'Forlænget'], ['overtime', 'Forlænget'], ['penalties', 'Straffe']] as const) {
      const p = r.periods?.[k]
      if (p && typeof p === 'object') pair(label, p.home, p.away)
    }
  } else if (sport === 'ice_hockey') {
    for (const [k, label] of [['first', '1. periode'], ['second', '2. periode'], ['third', '3. periode'], ['overtime', 'Forlænget'], ['penalties', 'Straffeslag']] as const) {
      const v = r.periods?.[k]
      const m = typeof v === 'string' ? /^(\d+)\s*-\s*(\d+)$/.exec(v) : null
      if (m) pair(label, m[1], m[2])
    }
  } else if (sport === 'basketball') {
    for (const [k, label] of [['quarter_1', '1. kvt.'], ['quarter_2', '2. kvt.'], ['quarter_3', '3. kvt.'], ['quarter_4', '4. kvt.'], ['over_time', 'Forlænget']] as const) pair(label, r.scores?.home?.[k], r.scores?.away?.[k])
  }
  return out.length ? out : undefined
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
  /** 2: seasons saved with their rounds and awarded matches (older ones are fetched again) */
  historyVersion?: number
  /** Past seasons' official final tables and top scorers, for checking the saved matches: "division|year" -> */
  historyTables?: Record<string, HistoryTable>
  /** API-Sports' leagues that are not ours, by externalLeagueKey, for their league pages */
  leagues?: Record<string, ExternalLeague>
  /** Goals seen from the score changing between two fetches, by game id (the minute is approximate) */
  goalLog?: Record<string, { at: number; goals: Incident[] }>
  remaining?: number
  /** When `remaining` was last read from a response */
  remainingAt?: number
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
  /** The league filter (`keep`) the stored days were fetched with */
  keepVersion?: string
  /** Today's requests (UTC day) by kind of request and by UTC hour, for /admin/data */
  usage?: { day: string; kinds: Record<string, number>; hours: number[] }
}
type Store = Record<string, ApiState>

const file = (): string => process.env.APISPORTS_FILE ?? path.join(/*turbopackIgnore: true*/ cacheDir(), 'apisports.json')

// On globalThis: the job and the pages load separate copies of this module
const holder = globalThis as { __scorelineApiSports?: { store: Store; mtime: number; readAt: number; games?: ExternalGame[]; gamesVersion?: string; season?: ExternalGame[]; seasonFor?: number } }
const mem = (holder.__scorelineApiSports ??= { store: {}, mtime: 0, readAt: 0 })

function load() {
  const now = Date.now()
  if (now - mem.readAt < 5_000) return
  mem.readAt = now
  try {
    const mtime = statSync(file()).mtimeMs
    if (mtime !== mem.mtime) {
      mem.store = timed('apisports.json læses', () => JSON.parse(readFileSync(file(), 'utf8')) as Store)
      // A count below 0 saved before the check above: unknown, not used up
      for (const st of Object.values(mem.store)) if (st && typeof st.remaining === 'number' && st.remaining < 0) st.remaining = undefined
      mem.mtime = mtime
      mem.games = undefined
      mem.season = undefined
    }
  } catch {
    // No file yet
  }
}

function save() {
  // Only the process running the jobs writes the file (the site process of a split server only reads it)
  if (!runsJobs()) return
  try {
    mkdirSync(path.dirname(file()), { recursive: true })
    timed('apisports.json gemmes', () => writeFileSync(`${file()}.tmp`, JSON.stringify(mem.store)))
    renameSync(`${file()}.tmp`, file())
    mem.mtime = statSync(file()).mtimeMs
    mem.games = undefined
    mem.season = undefined
  } catch {
    // try again next time
  }
}

const window = (today: string) => Array.from({ length: 12 }, (_, i) => addDays(today, i - 1))

/** Every game from yesterday to ten days ahead, all APIs; and a version that changes with them */
export function externalGames(): { version: string; games: ExternalGame[] } {
  load()
  if (!mem.games) timed('API-Sports-kampe samles', () => {
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
    mem.gamesVersion = gamesVersion(mem.games)
  })
  // At least every 5 minutes anyway (the minute of live games outside our leagues)
  return { version: `${mem.gamesVersion}|${Math.floor(Date.now() / 300_000)}`, games: mem.games! }
}

/**
 * What the pages show of the games, as one short string. The file is saved
 * every 30 seconds by the live job even when nothing changed; a new version
 * makes the server rebuild everything and every open page reload, so the
 * version only changes with the games: kick-off, state, score, goals and cards,
 * and the live minute only in our leagues and cups (the rest every 5 minutes).
 */
function gamesVersion(games: ExternalGame[]) {
  const h = createHash('sha1')
  for (const g of games) {
    const ours = !!divisionOfGame(g) || !!cupOfGame(g) || wholeSeason(g)
    h.update(`${g.id}|${g.kickoff}|${g.state}|${g.homeScore ?? ''}-${g.awayScore ?? ''}|${g.incidents?.length ?? 0}|${ours ? (g.label ?? '') : ''}\n`)
  }
  return h.digest('hex').slice(0, 16)
}

const inOurLeague = (g: ExternalGame) => g.state === 'finished' && g.homeScore !== undefined && (!!divisionOfGame(g) || wholeSeason(g))

/** The finished games in our leagues this season (kept days and the current window) */
export function seasonGames(): ExternalGame[] {
  load()
  // The same list until the data changes (asked for several times on every merge)
  if (mem.season && mem.seasonFor === mem.mtime) return mem.season
  const byId = new Map<string, ExternalGame>()
  for (const s of Object.values(mem.store)) {
    for (const games of Object.values(s.past ?? {})) for (const g of games) byId.set(g.id, g)
    for (const d of Object.values(s.days)) for (const g of d.games) if (inOurLeague(g)) byId.set(g.id, g)
  }
  mem.season = [...byId.values()]
  mem.seasonFor = mem.mtime
  return mem.season
}

// ---------------------------------------------------------------- fetching

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const utcDay = () => new Date().toISOString().slice(0, 10)
const msUntilReset = () => {
  const d = new Date()
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - d.getTime()
}

/** One request to an API; keeps the quota from the response headers */
/** The kind of a request, from its path and first parameter ("/fixtures?date", "/players/topscorers") */
const usageKind = (pathAndQuery: string) => pathAndQuery.split('&')[0].replace(/=.*/, '')
function countUsage(s: ApiState, pathAndQuery: string) {
  const day = utcDay()
  if (s.usage?.day !== day) s.usage = { day, kinds: {}, hours: Array(24).fill(0) }
  const kind = usageKind(pathAndQuery)
  s.usage.kinds[kind] = (s.usage.kinds[kind] ?? 0) + 1
  s.usage.hours[new Date().getUTCHours()]++
}

async function call(api: Api, pathAndQuery: string, timeoutMs = 20_000): Promise<{ response?: Raw[]; error?: string }> {
  const s = (mem.store[api] ??= { days: {} })
  s.requests = (s.requests ?? 0) + 1
  countUsage(s, pathAndQuery)
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
    // API-Sports answers -1 around the daily reset: not a real count (it once stopped football for a whole day)
    if (remaining !== undefined && remaining >= 0) {
      s.remaining = remaining
      s.quotaDay = utcDay()
      s.remainingAt = Date.now()
    }
    if (limit !== undefined) s.limit = limit
    onPaidPlan(s)
    // An error page instead of JSON (a 502 from the source): its status, so it counts as a passing error
    const body = (await res.json().catch(() => undefined)) as { response?: Raw[]; errors?: unknown } | undefined
    if (!body) return { error: `${res.status} ${res.statusText || 'svar uden JSON'}` }
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

/**
 * Whether the job keeps a game's league: always our own leagues and cups;
 * otherwise the admin's choice (/admin/ligaer), else the built-in list (`keep`).
 */
function keeps(api: Api, g: ExternalGame): boolean {
  if (divisionOfGame(g) || cupOfGame(g)) return true
  const choice = followChoice(api, g.league.id)
  // Every women's league is followed (the /kvindefodbold page), unless switched off in the admin
  return choice ? choice === 'on' : APIS[api].keep(g) || isWomenGame(g)
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

/**
 * How long the day fetches wait after an error. A wrong key or the plan's
 * limits would only repeat: an hour. A passing one (a timeout, the network,
 * too many requests in a minute, the source's own server error) must not stop
 * the live scores for an hour: a minute.
 */
const TRANSIENT = /too many requests|rate ?limit|per minute|timeout|timed out|abort|fetch failed|network|socket|ECONN|ENOTFOUND|EAI_AGAIN|^5\d\d\b/i
export const errorPause = (error: string | undefined) => (error && TRANSIENT.test(error) && !/for the day/i.test(error) ? 60_000 : 3_600_000)
const pausedByError = (s: ApiState, api: Api, now: number) =>
  !!s.lastErrorAt && now - s.lastErrorAt < errorPause(s.lastError) && s.keyFingerprint === fingerprint(keyFor(api))

/**
 * Requests a day for the match pages' extras (head-to-head, form, tables, events, statistics):
 * on a paid plan a fixed part of the limit, plus half of what is left above the
 * live scores' reserve (calls not needed tonight go to what visitors open)
 */
function extrasPerDay(api: Api, s: ApiState | undefined): number {
  if (!isPaid(s)) return 30
  const base = Math.max(30, Math.min(EXTRAS_MAX, Math.round((s!.limit ?? 100) * 0.2)))
  const remaining = s!.quotaDay === utcDay() ? (s!.remaining ?? 0) : (s!.limit ?? 0)
  const e = extrasStore().spent[api]
  const spent = e?.day === utcDay() ? e.count : 0
  // What is spent already counts back in, so the cap doesn't shrink as the extras use calls
  return base + Math.max(0, Math.round((remaining + spent - base - backgroundReserve(s)) / 2))
}
/** At most this many a day for what visitors (and search engines) open: match, team, league and player pages */
const EXTRAS_MAX = 1_500
/** Requests a paid plan always keeps for the live scores: everything else may use the rest */
const PAID_RESERVE = 300
/**
 * What the background work (past seasons' goals, cards and players, earlier
 * tables) must leave for the rest of the day's live scores: the reserve plus a
 * share of the live budget for the hours left until the reset. In the morning
 * it keeps about 2,500 back, late in the day little, so the history is filled
 * from the day's spare calls without eating the evening's live games.
 */
const LIVE_BUDGET = 2_500
/**
 * The last stretch before the reset (00:00 UTC, 01–02 Danish time): the day's calls are lost at the
 * reset, so the background work may use them down to a small floor – unless one of our leagues', cups'
 * or the Champions League's games is on or about to start, then the normal reserve holds
 */
const LAST_CALLS_MS = 90 * 60_000
const LAST_CALLS_FLOOR = 50
const oursOn = (s: ApiState) => {
  const until = Date.now() + LAST_CALLS_MS
  return (s.days[isoDate(Date.now())]?.games ?? []).some(
    (g) => (g.state === 'live' || (g.state === 'upcoming' && Date.parse(g.kickoff) < until)) && (!!divisionOfGame(g) || wholeSeason(g)),
  )
}
function backgroundReserve(s: ApiState | undefined): number {
  if (!isPaid(s)) return 40
  if (msUntilReset() < LAST_CALLS_MS && !oursOn(s!)) return LAST_CALLS_FLOOR
  const budget = Math.min(LIVE_BUDGET, Math.round((s!.limit ?? 100) * 0.35))
  return PAID_RESERVE + Math.round((budget * msUntilReset()) / 86_400_000)
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
  const games = (response ?? []).map((r) => def.toGame(r, api)).filter((g): g is ExternalGame => !!g && keeps(api, g))
  logGoals(s, s.days[date]?.games ?? [], games)
  s.days[date] = { fetchedAt: Date.now(), games: keepEvents(s.days[date]?.games ?? [], games) }
  s.lastError = undefined
  s.lastErrorAt = undefined
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

/** Every team in the league tables we have, for the teams without a game in the fetched days (their pages and links) */
type TableTeam = { leagueKey: string; sport: SportId; league: string; country?: string; name: string; logo?: string }
const tableTeamsHolder = globalThis as typeof globalThis & { __scorelineTableTeams?: { at: number; teams: TableTeam[] } }
export function tableTeams(): TableTeam[] {
  // Hundreds of leagues' tables, each read from h2h.db: kept ten minutes (the tables change every twelve hours)
  const c = tableTeamsHolder.__scorelineTableTeams
  if (c && Date.now() - c.at < 10 * 60_000) return c.teams
  const teams = timed('Tabellernes hold samles', tableTeamsNow)
  tableTeamsHolder.__scorelineTableTeams = { at: Date.now(), teams }
  return teams
}
function tableTeamsNow(): TableTeam[] {
  const store = extrasStore()
  return externalLeagues().flatMap((l) =>
    (store.entries[`${l.api}|table|${l.id}|${l.season ?? ''}`]?.table ?? []).flatMap((group) =>
      group.map((r) => ({ leagueKey: l.key, sport: l.sport, league: l.name, country: l.country, name: r.name, logo: realLogo(r.logo) })),
    ),
  )
}

/** API-Sports' own table for a league (cached six hours); undefined when the plan or the budget doesn't allow it */
export async function apiLeagueTable(league: ExternalLeague): Promise<TableRow[][] | undefined> {
  const api = league.api as Api
  const def = APIS[api]
  if (!def?.standings) return undefined
  const groups = await cached(api, `${api}|table|${league.id}|${league.season ?? ''}`, 6 * 3_600_000, def.standings(league.id, league.season), 'table', readTable).catch(
    () => undefined,
  )
  // A list that holds every group (rows marked with their group, as the Nations Leagues send them): one table per group
  const split = groups?.flatMap((g) => {
    const names = [...new Set(g.map((r) => r.group).filter(Boolean))] as string[]
    return names.length > 1 ? names.map((n) => g.filter((r) => r.group === n)) : [g]
  })
  // The teams under the names we show (national teams in Danish, "(K)" for women's teams)
  const shown = split?.filter((g) => g.length > 1).map((g) => g.map((r) => ({ ...r, name: shownTeam(r.name, league.country), logo: realLogo(r.logo), group: r.group && /group|gruppe/i.test(r.group) ? danishGroup(r.group) : r.group })))
  return shown?.length ? shown : undefined
}

/** The day of this API most in need of a refresh, or nothing when the quota is spent */
function dueDay(api: Api, now: number): string | undefined {
  const s = mem.store[api] ?? { days: {} }
  const remaining = s.quotaDay === utcDay() ? (s.remaining ?? 100) : (s.limit ?? 100)
  // Used up: wait, except that a paid plan asks again after half an hour in case the count was wrong (one call reads it anew)
  if (remaining <= 2 && !(isPaid(s) && now - (s.remainingAt ?? 0) > 30 * 60_000)) return undefined
  // An earlier plan-limit error is not one to wait out
  if (s.lastError && /try from \d{4}-\d{2}-\d{2} to/.test(s.lastError)) {
    // The days are relative to when the error came, so only trust one from today
    if (s.lastErrorAt && isoDate(s.lastErrorAt) === isoDate(now)) planLimit(s, s.lastError)
    s.lastError = undefined
    s.lastErrorAt = undefined
  }
  // Wait after an error (an hour for a plan restriction or a wrong key, a minute for a passing one), unless the key has changed since
  if (pausedByError(s, api, now)) return undefined
  const today = isoDate(now)
  const age = (d: string) => now - (s.days[d]?.fetchedAt ?? 0)
  const todays = s.days[today]?.games ?? []
  const on = (g: ExternalGame) => {
    const t = Date.parse(g.kickoff)
    return g.state === 'live' || (g.state === 'upcoming' && t < now + 20 * 60_000 && t > now - 4 * 3_600_000)
  }
  const busy = todays.some(on)
  // Our leagues, cups and the Champions League every 30 seconds; games only in the other leagues every 2 minutes
  const ours = todays.some((g) => on(g) && (!!divisionOfGame(g) || wholeSeason(g)))
  // While games are on, today gets at most half the requests left above the reserve (a paid plan), so the rest of the day's work always has some
  const share = isPaid(s) ? Math.max(1, (remaining - PAID_RESERVE) / 2) : Math.max(1, remaining - 14)
  const todayEvery = busy ? Math.max(isPaid(s) ? (ours ? 30_000 : 120_000) : 5 * 60_000, msUntilReset() / share) : isPaid(s) ? 15 * 60_000 : 60 * 60_000
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
  if (remaining <= backgroundReserve(s)) return undefined
  if (pausedByError(s, api, now)) return undefined
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
export interface HistoryScorer {
  id?: number
  name: string
  team: string
  goals: number
  penalties: number
}
interface HistoryTable {
  fetchedAt: number
  groups?: TableRow[][]
  scorers?: HistoryScorer[]
  error?: string
  /** Times the season's matches were fetched again because they didn't match the table */
  refetches?: number
  refetchedAt?: number
}

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
  if (remaining <= backgroundReserve(s)) return undefined
  learnLeagueIds(api)
  // Seasons saved before rounds and awarded matches were kept: fetched again once
  if ((s.historyVersion ?? 1) < 2) {
    for (const [key, n] of Object.entries(s.history ?? {})) if (n > 0) delete s.history![key]
    s.historyVersion = 2
  }
  for (const division of DIVISIONS) {
    if (API_FOR_SPORT[sportOf(division)] !== api) continue
    const league = leagueIdOf(api, s, division)
    if (!league) continue
    for (const year of historyYears(s)) if (s.history?.[`${division.id}|${year}`] === undefined) return { division, league, year }
  }
  return undefined
}

const leagueIdOf = (api: Api, s: ApiState, division: Division) => (api === 'football' ? FOOTBALL_IDS[division.id] : undefined) ?? s.leagueIds?.[division.id]

/** A saved past season without its official table yet (or with a failed attempt a day ago) */
function historyTableDue(api: Api): { division: Division; league: string; year: number; key: string } | undefined {
  const s = mem.store[api]
  if (!s) return undefined
  for (const [key, n] of Object.entries(s.history ?? {})) {
    if (!n) continue
    const t = s.historyTables?.[key]
    if (t && !(t.error && Date.now() - t.fetchedAt > 86_400_000)) continue
    const [divisionId, year] = key.split('|')
    const division = DIVISIONS.find((d) => d.id === divisionId)
    const league = division && leagueIdOf(api, s, division)
    if (division && league) return { division, league, year: Number(year), key }
  }
  return undefined
}

/** The official final table (and, for football, the top scorers) of a saved past season */
async function fetchHistoryTable(api: Api, due: { division: Division; league: string; year: number; key: string }) {
  const s = mem.store[api]!
  const { param } = seasonNames(api, due.division, due.year)
  const entry: HistoryTable = { ...s.historyTables?.[due.key], fetchedAt: Date.now(), error: undefined }
  const { response, error } = await call(api, `/standings?league=${due.league}&season=${param}`)
  if (error || !response?.length) entry.error = error ?? 'Ingen slutstilling'
  else entry.groups = readTable(response).filter((g) => g.length > 1)
  if (api === 'football' && isPaid(s)) {
    const top = await call(api, `/players/topscorers?league=${due.league}&season=${param}`)
    entry.scorers = (top.response ?? []).map((r): HistoryScorer => {
      const st = r.statistics?.[0] ?? {}
      return { id: num(r.player?.id), name: String(r.player?.name ?? ''), team: String(st.team?.name ?? ''), goals: Number(st.goals?.total ?? 0), penalties: Number(st.penalty?.scored ?? 0) }
    }).filter((x: HistoryScorer) => x.name && x.goals > 0)
  }
  ;(s.historyTables ??= {})[due.key] = entry
}

/**
 * Past seasons whose saved matches don't match the official table: their
 * matches are fetched again (at most three times, three days apart).
 */
function historyRecheck(api: Api) {
  const s = mem.store[api]
  if (!s) return
  for (const [key, t] of Object.entries(s.historyTables ?? {})) {
    if (!t.groups?.length || !s.history?.[key]) continue
    if ((t.refetches ?? 0) >= 3 || Date.now() - (t.refetchedAt ?? 0) < 3 * 86_400_000) continue
    const [divisionId, year] = key.split('|')
    const division = DIVISIONS.find((d) => d.id === divisionId)
    if (!division) continue
    const check = checkSeason(division.id, seasonNames(api, division, Number(year)).label, sportOf(division), t.groups)
    if (check.status !== 'missing' && check.status !== 'mismatch') continue
    delete s.history[key]
    t.refetches = (t.refetches ?? 0) + 1
    t.refetchedAt = Date.now()
  }
}

/** A past season's official table and top scorers, when fetched ("2019/2020" or "2019") */
export function historyOfficial(divisionId: string, season: string): { groups?: TableRow[][]; scorers?: HistoryScorer[]; fetchedAt: number } | undefined {
  load()
  const division = DIVISIONS.find((d) => d.id === divisionId)
  const api = division && API_FOR_SPORT[sportOf(division)]
  const t = api ? mem.store[api]?.historyTables?.[`${divisionId}|${season.slice(0, 4)}`] : undefined
  return t && { groups: t.groups, scorers: t.scorers, fetchedAt: t.fetchedAt }
}

/** Every past season we have fetched, with its check, for /admin/kvalitet */
export function historyOverview() {
  load()
  const out: { api: string; division: Division; year: number; season: string; saved: number; table?: HistoryTable; check?: ReturnType<typeof checkSeason> }[] = []
  for (const api of Object.keys(APIS) as Api[]) {
    const s = mem.store[api]
    for (const [key, saved] of Object.entries(s?.history ?? {})) {
      const [divisionId, year] = key.split('|')
      const division = DIVISIONS.find((d) => d.id === divisionId)
      if (!division) continue
      const season = seasonNames(api, division, Number(year)).label
      const table = s?.historyTables?.[key]
      out.push({ api, division, year: Number(year), season, saved, table, check: saved ? checkSeason(division.id, season, sportOf(division), table?.groups) : undefined })
    }
  }
  return out.sort((a, b) => DIVISIONS.indexOf(a.division) - DIVISIONS.indexOf(b.division) || b.year - a.year)
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
  const games = (response ?? [])
    .map((r) => {
      const g = APIS[api].toGame(r, api)
      // A match awarded at the green table (AWD, WO) counts in the table with its awarded score
      const short = String(r.fixture?.status?.short ?? r.status?.short ?? '')
      return g && (short === 'AWD' || short === 'WO') && g.homeScore !== undefined && g.awayScore !== undefined ? { ...g, state: 'finished' as const } : g
    })
    .filter((g): g is ExternalGame => !!g)
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
  // The Champions League (men 2, women 525 at API-Sports) also between match days; games from another league are left out by name
  for (const id of ['2', '525']) wanted.add(id)
  // The cups and the tournaments kept for the whole season (the Champions League), by the league id their games have
  for (const g of seen) if (wholeSeason(g) && g.league.id) wanted.add(g.league.id)
  // Every other league we follow: its season's results for the statistics bank (team pages' results), once a day with calls to spare
  const others = new Set<string>()
  if (remaining > backgroundReserve(s)) for (const g of seen) if (g.league.id && !wanted.has(g.league.id)) others.add(g.league.id)
  const every = (l: string) => (others.has(l) ? 24 * 3_600_000 : 3_600_000)
  const league = [...wanted, ...others]
    .filter((l) => now - (s.seasonSynced?.[l] ?? 0) > every(l))
    .sort((a, b) => (s.seasonSynced?.[a] ?? 0) - (s.seasonSynced?.[b] ?? 0))[0]
  return league ? { league } : undefined
}

async function fetchSeason(api: Api, due: { league: string }) {
  const s = mem.store[api]!
  ;(s.seasonSynced ??= {})[due.league] = Date.now()
  const { response, error } = await call(api, `/fixtures?league=${due.league}&season=${SEASON.slice(0, 4)}&${TZ}`)
  if (error) return
  const all = (response ?? []).map((r) => APIS[api].toGame(r, api)).filter((g): g is ExternalGame => !!g)
  // Other leagues' results go straight to the statistics bank
  const other = all.filter((g) => !inOurLeague(g) && !divisionOfGame(g) && !wholeSeason(g))
  if (other.length) archiveSeason(`ext-${api}-${due.league}`, other[0].league.name, SEASON.slice(0, 4), other)
  const games = all.filter(inOurLeague)
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

/** Changed whenever the leagues we keep (`keep`) change: the stored days are then fetched again right away */
const KEEP_VERSION = '2026-09-30-women-b-liga'

/**
 * The fast lane for paid plans: while games are on, today is fetched every 30
 * seconds, and the goals and cards of games whose score just changed come right
 * after. The rest (other days, seasons, history) stays in the main run.
 */
let liveRunning = false
async function liveTick() {
  if (liveRunning) return
  liveRunning = true
  try {
    load()
    let changed = false
    for (const api of Object.keys(APIS) as Api[]) {
      const s = mem.store[api]
      if (!keyFor(api) || !isPaid(s)) continue
      const today = isoDate(Date.now())
      if (dueDay(api, Date.now()) !== today) continue
      await fetchDay(api, today)
      changed = true
      // New goals: their scorers straight away (live games whose score changed)
      if (api === 'football') {
        const ids = eventsDue(s!).filter((id) => mem.store.football!.days[today]?.games.some((g) => g.id === `football-${id}` && g.state === 'live'))
        if (ids.length) await fetchEvents('football', ids)
      }
    }
    if (changed) save()
  } finally {
    liveRunning = false
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
    // New leagues: the days fetched with the old filter are due again
    const keepVersion = `${KEEP_VERSION}|${leagueFollowChoices().version}`
    for (const s of Object.values(mem.store)) {
      if (s.keepVersion === keepVersion) continue
      for (const d of Object.values(s.days)) d.fetchedAt = 0
      s.keepVersion = keepVersion
      changed = true
    }
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
    // The tables of the other leagues we follow (paid plans), so every team in them has a page, five a run
    {
      const s = mem.store.football
      const left = s?.quotaDay === utcDay() ? (s.remaining ?? 0) : (s?.limit ?? 0)
      if (s && isPaid(s) && keyFor('football') && !dueDay('football', Date.now()) && left > backgroundReserve(s)) {
        const store = extrasStore()
        const followed = new Set(Object.values(s.days).flatMap((d) => d.games.map((g) => g.league.id)))
        const due = externalLeagues()
          .filter((l) => l.api === 'football' && followed.has(l.id))
          .filter((l) => Date.now() - (store.entries[`football|table|${l.id}|${l.season ?? ''}`]?.fetchedAt ?? 0) > 12 * 3_600_000)
          .slice(0, 5)
        for (const l of due) {
          await apiLeagueTable(l)
          changed = true
          await sleep(300)
        }
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
        if (remaining < backgroundReserve(s)) break
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
        savePlayerGames(response, ids, true)
        changed = true
        await sleep(300)
      }
    }
    // Every player's numbers for saved matches (the players' pages), 20 matches a request, down to the reserve
    {
      const s = mem.store.football
      for (let n = 40; s && isPaid(s) && keyFor('football') && !dueDay('football', Date.now()) && n > 0; n--) {
        const remaining = s.quotaDay === utcDay() ? (s.remaining ?? 0) : (s.limit ?? 0)
        if (remaining < backgroundReserve(s)) break
        const ids = archiveMissingPlayers(20)
        if (!ids.length) break
        const { response, error } = await call('football', `/fixtures?ids=${ids.map((id) => id.split('-').pop()).join('-')}&${TZ}`)
        if (error) break
        // Every match asked for is marked, also those the answer left out or had no players for
        savePlayerGames(response, ids, true)
        await sleep(300)
      }
    }
    // Past seasons of our leagues for the club pages' history, with requests left over, one per API per run
    for (const api of Object.keys(APIS) as Api[]) {
      if (!keyFor(api) || dueDay(api, now)) continue
      // Each saved season's official table (to check the matches against), then the seasons that don't match are fetched again
      for (let n = isPaid(mem.store[api]) ? 15 : 1; n > 0; n--) {
        const s = mem.store[api]!
        const remaining = s.quotaDay === utcDay() ? (s.remaining ?? 100) : (s.limit ?? 100)
        if (remaining <= backgroundReserve(s)) break
        const due = historyTableDue(api)
        if (!due) break
        try {
          await fetchHistoryTable(api, due)
        } catch {
          ;(s.historyTables ??= {})[due.key] = { fetchedAt: Date.now(), error: 'Uventet svar' }
        }
        changed = true
        await sleep(isPaid(s) ? 300 : 2_000)
      }
      try {
        historyRecheck(api)
      } catch {
        // the statistics bank could not be read: checked next run
      }
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
  // Paid plans: today's games every 30 seconds while games are on, between the main runs
  const live = () => liveTick().catch((err) => console.error('API-Sports live fejlede:', err))
  setInterval(() => void live(), 30_000).unref()
}

/** The data files behind API-Sports' data, for the status page's memory line */
export const apiSportsFiles = () => ({ 'apisports.json': file(), 'h2h.db': extrasDbFile() })

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
      // Until when the day fetches (and the live scores) wait because of the error
      pausedUntil: s && pausedByError(s, api, Date.now()) ? new Date(s.lastErrorAt! + errorPause(s.lastError)).toISOString() : null,
      allowedDays: s?.allowedDays ?? null,
      history: Object.entries(s?.history ?? {}).map(([k, n]) => ({ key: k, matches: n })),
      usage: s?.usage?.day === utcDay() ? s.usage : null,
      extrasSpent: (() => {
        const e = extrasStore().spent[api]
        return e?.day === utcDay() ? e.count : 0
      })(),
      extrasMax: extrasPerDay(api as Api, s),
      reserveNow: backgroundReserve(s),
    }
  })
}

// ---------------------------------------------------------------- match page extras
// Head-to-head, the teams' latest games and the league table, fetched when a
// match page is first viewed and cached (h2h.db). They share a small daily
// budget per API and are never fetched when the day's quota runs low.

interface ExtraStore {
  entries: Record<string, { fetchedAt: number; games?: ExternalGame[]; table?: TableRow[][]; incidents?: Incident[]; final?: boolean; stats?: Record<'home' | 'away', Record<string, string | number | null>>; catalog?: CatalogLeague[]; lineups?: Lineup[]; leaders?: Leaders; player?: PlayerData; teamStats?: TeamStats; injuries?: Injury[]; subs?: Substitution[] }>
  /** Requests spent on extras per API and UTC day */
  spent: Record<string, { day: string; count: number }>
}
const EXTRAS_KEEP_REMAINING = 20
/**
 * Takes `cost` requests from the day's budget for extras (what a page view
 * fetches), or false when it is spent or the day's live scores need the rest:
 * on a paid plan extras stop at the same reserve as the background work.
 */
function spendExtra(api: Api, cost = 1, kind?: 'players'): boolean {
  // A crawler's page (not Google's or Bing's) uses what is saved (src/lib/visitorBudget.ts)
  if (spendingBlocked()) return false
  load()
  const s = mem.store[api]
  const store = extrasStore()
  const remaining = s?.quotaDay === utcDay() ? (s.remaining ?? 100) : (s?.limit ?? 100)
  const spent = store.spent[api]?.day === utcDay() ? store.spent[api].count : 0
  const floor = isPaid(s) ? backgroundReserve(s) : EXTRAS_KEEP_REMAINING
  if (remaining - cost < floor || spent + cost > extrasPerDay(api, s)) return false
  // Player pages (crawlers follow every player link) get at most a third, so match pages keep theirs
  const own = kind ? `${api}|${kind}` : undefined
  const ownSpent = own && store.spent[own]?.day === utcDay() ? store.spent[own].count : 0
  if (own && ownSpent + cost > Math.round(extrasPerDay(api, s) / 3)) return false
  if (own) store.spent[own] = { day: utcDay(), count: ownSpent + cost }
  store.spent[api] = { day: utcDay(), count: spent + cost }
  store.touch()
  return true
}
const extrasFile = (): string => process.env.H2H_FILE ?? path.join(/*turbopackIgnore: true*/ cacheDir(), 'h2h.json')
const extrasDbFile = (): string => process.env.H2H_DB ?? path.join(/*turbopackIgnore: true*/ cacheDir(), 'h2h.db')
const extrasHolder = globalThis as { __scorelineH2hDb?: KvStore<ExtraStore['entries'][string]> }
/** The extras, in SQLite (src/lib/extrasDb.ts): an entry is read when asked for, not the whole store */
function extrasStore(): KvStore<ExtraStore['entries'][string]> {
  return (extrasHolder.__scorelineH2hDb ??= kvStore(extrasDbFile(), extrasFile()))
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
  if (!spendExtra(api)) return entry?.[kind]
  const { response, error } = await call(api, pathAndQuery, 5_000)
  if (error) return entry?.[kind]
  const fresh = { fetchedAt: Date.now(), [kind]: read(response ?? []) }
  store.entries[key] = fresh
  extrasStore().flush()
  return fresh[kind] as ExtraStore['entries'][string][T]
}

const toGames = (api: Api) => (response: Raw[]) => response.map((r) => APIS[api].toGame(r, api)).filter((g): g is ExternalGame => !!g)
const finishedBefore = (games: ExternalGame[] | undefined, kickoff: string, count: number) =>
  (games ?? [])
    .filter((g) => g.state === 'finished' && g.homeScore !== undefined && g.awayScore !== undefined && g.kickoff < kickoff)
    .sort((x, y) => y.kickoff.localeCompare(x.kickoff))
    .slice(0, count)

/** How long a match takes from kick-off to the end, breaks and stoppages included */
const MATCH_LENGTH_MS: Partial<Record<SportId, number>> = { soccer: 2 * 3_600_000, handball: 1.75 * 3_600_000, basketball: 2.5 * 3_600_000, ice_hockey: 2.75 * 3_600_000, volleyball: 2.5 * 3_600_000, american_football: 3.5 * 3_600_000 }

/** The last meetings of the two teams in an API-Sports game, before its kickoff (cached for three days) */
export async function apiHeadToHead(game: ExternalGame, count = 5): Promise<ExternalGame[] | undefined> {
  const api = apiOf(game)
  const def = APIS[api]
  const a = game.home.id
  const b = game.away.id
  if (!def || !a || !b) return undefined
  // Half a day on a paid plan (a meeting last week must be there), three days otherwise
  const games = await cached(api, `${api}|${Math.min(a, b)}-${Math.max(a, b)}`, isPaid(mem.store[api]) ? 12 * 3_600_000 : 3 * 86_400_000, def.h2h(a, b), 'games', toGames(api))
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
        group: r.group ?? undefined,
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

/** A group's name in Danish ("Group A" -> "Gruppe A", "League B, Group 2" -> "Liga B, gruppe 2") */
function danishGroup(name: string) {
  const s = name.replace(/^.*\s-\s(?=.*\bGroup\b)/, '').replace(/\bLeague ([A-Z])\b/g, 'Liga $1').replace(/\bGroup\b/g, 'Gruppe').trim()
  return s.replace(/,\s*Gruppe/, ', gruppe')
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
  // A table fetched before the match was over says nothing of its result (it once stood six hours with "3 points" under a
  // report of the win): after the final whistle it is fetched again every quarter of an hour, until one is from an hour
  // after the match – the source needs that long to count it – and until then it is marked as behind
  const tableKey = `${api}|table|${game.league.id}|${game.league.season ?? ''}`
  const counted = Date.parse(game.kickoff) + (MATCH_LENGTH_MS[game.sport] ?? 2 * 3_600_000) + 3_600_000
  const tableAt = () => extrasStore().entries[tableKey]?.fetchedAt ?? 0
  const justPlayed = game.state === 'finished' && tableAt() < counted && Date.now() < counted + 12 * 3_600_000
  const [homeGames, awayGames, table] = await Promise.all([
    form(game.home.id).catch(() => undefined),
    form(game.away.id).catch(() => undefined),
    game.league.id
      ? cached(api, tableKey, justPlayed ? 15 * 60_000 : 6 * 3_600_000, def.standings?.(game.league.id, game.league.season), 'table', readTable).catch(() => undefined)
      : undefined,
  ])
  const behind = game.state === 'finished' && tableAt() < counted
  const toForm = (games: ExternalGame[] | undefined, team?: number): FormGame[] =>
    finishedBefore(games, game.kickoff, 5).map((g) => {
      const home = g.home.id === team
      return {
        date: g.kickoff,
        opponent: shownTeam(home ? g.away.name : g.home.name, g.league.country),
        home,
        for: (home ? g.homeScore : g.awayScore) ?? 0,
        against: (home ? g.awayScore : g.homeScore) ?? 0,
        competition: danishLeagueName(g.league.name, g.league.country) ?? g.league.name,
      }
    })
  const extra: MatchExtra = { facts }
  const homeForm = toForm(homeGames, game.home.id)
  const awayForm = toForm(awayGames, game.away.id)
  if (homeForm.length || awayForm.length) extra.form = { home: homeForm, away: awayForm }
  // The group with either team in it
  const list = table?.find((rows) => rows.some((r) => r.teamId === game.home.id || r.teamId === game.away.id))
  // Some tournaments (the Nations Leagues) send every group in one list, each row marked with its group: only the teams' own
  const own = list?.find((r) => r.teamId === game.home.id || r.teamId === game.away.id)?.group
  const marked = new Set((list ?? []).map((r) => r.group).filter(Boolean))
  const group = own && marked.size > 1 ? list!.filter((r) => r.group === own) : list
  const groupName = own && /group|gruppe/i.test(own) ? danishGroup(own) : undefined
  if (group && group.length > 1)
    extra.table = { name: groupName, rows: group.map((r) => ({ ...r, name: shownTeam(r.name, game.league.country), logo: realLogo(r.logo) })), homeId: game.home.id, awayId: game.away.id, source: 'api-sports', ...(behind && { behind }) }
  return extra
}

// ---------------------------------------------------------------- goals and cards of a football match

/**
 * Goals and cards of an API-Sports football match, for the match page's
 * timeline. Fetched again only when the score has changed since (a new goal)
 * and once more when the match is over (for late cards), so a live match
 * costs a request per goal, not per page view.
 */
export async function apiMatchEvents(game: ExternalGame, opts: { spend?: boolean } = {}): Promise<Incident[] | undefined> {
  const api = apiOf(game)
  if (api !== 'football' || game.state === 'upcoming' || game.state === 'postponed') return undefined
  // The goals come with the next batch anyway; a request of its own only for a person (not a robot) while the budget lasts
  wantEvents(game)
  const store = extrasStore()
  const key = `${api}|events|${game.id}`
  const entry = store.entries[key]
  const goals = (game.homeScore ?? 0) + (game.awayScore ?? 0)
  const counted = (entry?.incidents ?? []).filter((i) => i.kind !== 'yellow' && i.kind !== 'red').length
  const fresh = entry && counted === goals && (game.state !== 'finished' || entry.final)
  if (fresh || (entry && Date.now() - entry.fetchedAt < 60_000)) return entry.incidents
  // The batch's own goals (saved on the game itself) when they are there
  if (!entry && game.incidents?.length) return game.incidents
  if (!keyFor(api) || opts.spend === false) return entry?.incidents
  if (!spendExtra(api)) return entry?.incidents
  const id = game.id.split('-').pop()
  const { response, error } = await call(api, `/fixtures/events?fixture=${id}`, 5_000)
  if (error) return entry?.incidents
  const known = store.entries[`${api}|lineups|${game.id}`]?.lineups ?? []
  const spell = lineupSpelling(known)
  const incidents = toIncidents(response ?? [], game).map((x) => (x.player ? { ...x, player: spell(x.player) } : x))
  store.entries[key] = { fetchedAt: Date.now(), incidents, final: game.state === 'finished' }
  const subs = toSubs(response ?? [], game, known).map((x) => ({ ...x, on: spell(x.on), off: spell(x.off) }))
  if (subs.length) store.entries[`${api}|subs|${game.id}`] = { fetchedAt: Date.now(), subs, final: game.state === 'finished' }
  extrasStore().flush()
  return incidents
}

/**
 * The substitutions among API-Sports' events. Which of the two names went off is told by who was on the
 * pitch (the starting eleven, then the ones who came on), as the two fields are not always the same way round.
 */
function toSubs(events: Raw[], game: Pick<ExternalGame, 'home' | 'away'>, lineups: Lineup[]): Substitution[] {
  const subs: Substitution[] = []
  const onPitch = new Set(lineups.flatMap((l) => l.startXI.map((p) => normalize(p.name))))
  const ordered = [...events].sort((a, b) => Number(a.time?.elapsed ?? 0) + Number(a.time?.extra ?? 0) - (Number(b.time?.elapsed ?? 0) + Number(b.time?.extra ?? 0)))
  for (const r of ordered) {
    if (String(r.type ?? '').toLowerCase() !== 'subst') continue
    const side = num(r.team?.id) === game.home.id ? 'home' : num(r.team?.id) === game.away.id ? 'away' : undefined
    const minute = Number(r.time?.elapsed ?? 0) + Number(r.time?.extra ?? 0)
    const a = r.player?.name ? String(r.player.name) : undefined
    const b = r.assist?.name ? String(r.assist.name) : undefined
    if (!side || !a || !b) continue
    // The one on the pitch goes off; with no line-up to tell, API-Sports' "player" is the one going off
    const aOn = onPitch.has(normalize(a))
    const bOn = onPitch.has(normalize(b))
    const [off, on] = bOn && !aOn ? [b, a] : [a, b]
    onPitch.delete(normalize(off))
    onPitch.add(normalize(on))
    subs.push({ minute, side, on, off })
  }
  return subs
}

/** A game's saved substitutions (no request) */
export function savedSubs(gameId: string): Substitution[] | undefined {
  const subs = extrasStore().entries[`${gameId.split('-')[0]}|subs|${gameId}`]?.subs
  return subs?.length ? subs : undefined
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
// A live game in our leagues and cups again every 5 minutes (cards, line-up changes); any other game when its score changes
// "s": fetched with the substitutions (games fetched before they were saved come once more)
const eventsKey = (g: ExternalGame) =>
  `s|${g.state}|${g.homeScore ?? '-'}-${g.awayScore ?? '-'}${g.state === 'live' && (divisionOfGame(g) || wholeSeason(g)) ? `|${Math.floor(Date.now() / 300_000)}` : g.state === 'upcoming' ? `|${Math.floor(Date.now() / 900_000)}` : ''}`

/**
 * Football games whose goals, cards and line-ups are missing or out of date (a finished game once, a
 * live one when the score changes), up to 20: API-Sports gives 20 games with their events, line-ups,
 * statistics and players in one request. Every game, ours first, within the budget kept for live scores.
 */
/**
 * Games outside our leagues whose match page someone opened (friendlies, foreign leagues): their goals
 * come with the next batch of 20 instead of a request of their own. Kept two days.
 */
const viewedGames = new Map<string, number>()
export function wantEvents(game: ExternalGame) {
  if (apiOf(game) !== 'football' || game.state === 'upcoming' || game.state === 'postponed') return
  viewedGames.set(game.id, Date.now())
  for (const [id, at] of viewedGames) if (Date.now() - at > 2 * 86_400_000) viewedGames.delete(id)
}

function eventsDue(s: ApiState): string[] {
  const remaining = s.quotaDay === utcDay() ? (s.remaining ?? 100) : (s.limit ?? 100)
  if (!isPaid(s) || remaining <= PAID_RESERVE) return []
  const games = [...Object.values(s.days).flatMap((d) => d.games), ...Object.values(s.past ?? {}).flat()]
  const due = new Set<string>()
  // Every football game the partner has data for (20 a request): live games first, then games about to start
  // (their line-ups, out about an hour before), our leagues and cups, the games someone opened, and every other
  // finished game in the days we keep, newest first. Older seasons only for our leagues and opened games.
  const current = new Set(Object.values(s.days).flatMap((d) => d.games.map((g) => g.id)))
  const ours = (g: ExternalGame) => !!(divisionOfGame(g) || wholeSeason(g))
  const soon = (g: ExternalGame) => g.state === 'upcoming' && Date.parse(g.kickoff) - Date.now() < 75 * 60_000 && Date.parse(g.kickoff) > Date.now() - 15 * 60_000
  const lineupsIn = (g: ExternalGame) => !!extrasStore().entries[`football|lineups|${g.id}`]
  const rank = (g: ExternalGame) => (g.state === 'live' ? 0 : soon(g) ? 1 : ours(g) ? 2 : viewedGames.has(g.id) ? 3 : 4)
  const spare = remaining > backgroundReserve(s)
  const wanted = games
    .filter((g) => {
      if (!g.id.startsWith('football-') || g.eventsFor === eventsKey(g)) return false
      // Our live games always; everything else only while the budget kept for live scores is not touched
      if (g.state === 'live') return ours(g) || spare
      if (soon(g)) return spare && !lineupsIn(g)
      return g.state === 'finished' && spare && (ours(g) || viewedGames.has(g.id) || current.has(g.id))
    })
    .sort((a, b) => rank(a) - rank(b) || b.kickoff.localeCompare(a.kickoff))
  for (const g of wanted) {
    due.add(g.id.split('-').pop()!)
    if (due.size >= 20) break
  }
  return [...due]
}

/** Every player's numbers in one match, from a /fixtures?ids answer */
function toPlayerGames(r: Raw): PlayerGame[] {
  const eventId = `football-${r.fixture?.id}`
  const homeId = num(r.teams?.home?.id)
  const awayId = num(r.teams?.away?.id)
  return ((r.players ?? []) as Raw[]).flatMap((t) =>
    ((t.players ?? []) as Raw[])
      .map((pl): PlayerGame | undefined => {
        const st = pl.statistics?.[0] ?? {}
        const id = num(pl.player?.id)
        if (!id || !pl.player?.name) return undefined
        const minutes = num(st.games?.minutes)
        // Unused substitutes are left out
        if (!minutes) return undefined
        const teamId = num(t.team?.id)
        return {
          eventId,
          playerId: id,
          name: String(pl.player.name),
          teamId,
          team: String(t.team?.name ?? ''),
          side: teamId === homeId ? 'home' : teamId === awayId ? 'away' : undefined,
          position: st.games?.position ?? undefined,
          minutes,
          rating: num(st.games?.rating),
          goals: num(st.goals?.total) ?? 0,
          assists: num(st.goals?.assists) ?? 0,
          yellow: num(st.cards?.yellow) ?? 0,
          red: num(st.cards?.red) ?? 0,
          shots: num(st.shots?.total),
          shotsOn: num(st.shots?.on),
          passes: num(st.passes?.total),
          keyPasses: num(st.passes?.key),
          saves: num(st.goals?.saves),
          conceded: num(st.goals?.conceded),
          substitute: !!st.games?.substitute,
          captain: !!st.games?.captain,
        }
      })
      .filter((x): x is PlayerGame => !!x),
  )
}

/** Saves the players' numbers of the finished matches in an answer; failures only cost the extra */
function savePlayerGames(response: Raw[] | undefined, checked: string[], saved = false) {
  // Saved matches are finished; otherwise only the finished ones in the answer count (a live match is fetched again)
  const done = (response ?? []).filter((r) => saved || ['FT', 'AET', 'PEN'].includes(String(r.fixture?.status?.short ?? '')))
  try {
    archivePlayerGames(
      done.flatMap(toPlayerGames),
      saved ? checked : checked.filter((id) => done.some((r) => `football-${r.fixture?.id}` === id)),
    )
  } catch {
    // Fetched again with the backfill
  }
}

async function fetchEvents(api: Api, ids: string[]) {
  const s = mem.store[api]!
  const { response, error } = await call(api, `/fixtures?ids=${ids.join('-')}&${TZ}`)
  if (error) return
  // The players' numbers come with them: saved in the statistics bank for the players' pages
  if (api === 'football') savePlayerGames(response, ids.map((x) => `football-${x}`))
  const store = extrasStore()
  let statsChanged = false
  for (const r of response ?? []) {
    const id = `${api}-${r.fixture?.id}`
    const lists = [...Object.values(s.days).map((d) => d.games), ...Object.values(s.past ?? {})]
    for (const list of lists) {
      for (let i = 0; i < list.length; i++) {
        const g = list[i]
        if (g.id !== id) continue
        // The line-ups come with them: saved for the match page, and the players in the goals and cards spelt as there
        const lineups = toLineups(r.lineups ?? [])
        const spell = lineupSpelling(lineups)
        list[i] = { ...g, incidents: toIncidents(r.events ?? [], g).map((x) => (x.player ? { ...x, player: spell(x.player) } : x)), eventsFor: eventsKey(g) }
        if (lineups.length === 2) store.entries[`${api}|lineups|${id}`] = { fetchedAt: Date.now(), lineups, final: true }
        // The substitutions come with the events: saved for the match page
        const subs = toSubs(r.events ?? [], g, lineups).map((x) => ({ ...x, on: spell(x.on), off: spell(x.off) }))
        if (subs.length) store.entries[`${api}|subs|${id}`] = { fetchedAt: Date.now(), subs, final: g.state === 'finished' }
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
    extrasStore().flush()
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
    for (const g of games) for (const t of [g.home, g.away]) if (!map.has(t.name)) { const logo = realLogo(t.logo); if (logo) map.set(t.name, logo) }
  }
  holder.logos = { version, map }
  return map
}

/**
 * A football club's logo from the games of its own league (by the source's league id): for a club our logo source has
 * nothing for (Bodø/Glimt had its logo in the Champions League table, but initials on its own page). By one of the club's
 * names, else the one team of the league that is alike.
 */
export function apiClubLogo(leagueId: string, names: string[]): string | undefined {
  load()
  const holder = mem as typeof mem & { leagueLogos?: { version: string; byLeague: Map<string, Map<string, string>> } }
  const version = `${mem.mtime}|${logoCheckVersion()}`
  if (holder.leagueLogos?.version !== version) {
    const byLeague = new Map<string, Map<string, string>>()
    const s = mem.store.football
    for (const g of s ? [...Object.values(s.days).flatMap((d) => d.games), ...Object.values(s.past ?? {}).flat()] : []) {
      const id = String(g.league.id)
      const teams = byLeague.get(id) ?? byLeague.set(id, new Map()).get(id)!
      for (const t of [g.home, g.away]) {
        if (teams.has(t.name)) continue
        const logo = realLogo(t.logo)
        if (logo) teams.set(t.name, logo)
      }
    }
    holder.leagueLogos = { version, byLeague }
  }
  const teams = holder.leagueLogos.byLeague.get(String(leagueId))
  if (!teams) return undefined
  for (const n of names) if (teams.has(n)) return teams.get(n)
  const found = [...teams.entries()].filter(([name]) => alike(names, name))
  return found.length === 1 ? found[0][1] : undefined
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
  /** Whether our job keeps its games (ours, a cup we follow, the admin's choice, or the built-in list) */
  followed: boolean
  /** Ours or a cup we follow: always kept */
  fixed?: boolean
  /** Kept by the built-in list */
  standard?: boolean
  /** The admin's choice, when made */
  choice?: 'on' | 'off'
  /** Our league, when it is one */
  ours?: string
}

/** Every football league and cup API-Sports has this season, with what it covers (one request a day) */
export async function apiLeagueCatalog(): Promise<{ leagues: CatalogLeague[]; fetchedAt?: number; error?: string }> {
  const api: Api = 'football'
  const store = extrasStore()
  // v2: with the built-in list and our own leagues stored apart, so the admin's choices apply on top
  const key = `${api}|catalog2`
  const entry = store.entries[key]
  if (entry?.catalog && Date.now() - entry.fetchedAt < 24 * 3_600_000) return { leagues: withChoices(entry.catalog), fetchedAt: entry.fetchedAt }
  if (!keyFor(api)) return { leagues: withChoices(entry?.catalog ?? []), fetchedAt: entry?.fetchedAt, error: 'Ingen API-Sports-nøgle på serveren' }
  const { response, error } = await call(api, '/leagues?current=true')
  if (error) return { leagues: withChoices(entry?.catalog ?? []), fetchedAt: entry?.fetchedAt, error }
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
      followed: false,
      fixed: !!ours || !!cupOfGame(probe),
      standard: APIS[api].keep(probe) || isWomenGame(probe),
      ours: ours?.name,
    }
  })
  store.entries[key] = { fetchedAt: Date.now(), catalog: leagues }
  extrasStore().flush()
  return { leagues: withChoices(leagues), fetchedAt: Date.now() }
}

/** The catalog with the admin's choices applied (they change without fetching the catalog again) */
function withChoices(leagues: CatalogLeague[]): CatalogLeague[] {
  return leagues.map((l) => {
    const choice = l.fixed ? undefined : followChoice('football', l.id)
    return { ...l, choice, followed: !!l.fixed || (choice ? choice === 'on' : !!l.standard) }
  })
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
    if (spendExtra(api)) {
      const { response, error } = await call(api, `/fixtures/statistics?fixture=${game.id.split('-').pop()}`, 5_000)
      if (!error) {
        const stats: NonNullable<typeof entry>['stats'] = { home: {}, away: {} }
        for (const r of response ?? []) {
          const side = num(r.team?.id) === game.home.id ? 'home' : num(r.team?.id) === game.away.id ? 'away' : undefined
          if (side) for (const x of r.statistics ?? []) stats[side][String(x.type)] = x.value ?? null
        }
        entry = store.entries[key] = { fetchedAt: Date.now(), stats, final: game.state === 'finished' }
        extrasStore().flush()
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
    startXI: (t.startXI ?? []).map((x: Raw) => ({ name: String(x.player?.name ?? ''), number: num(x.player?.number), pos: x.player?.pos ?? undefined, grid: x.player?.grid ?? undefined, id: num(x.player?.id) })),
    substitutes: (t.substitutes ?? []).map((x: Raw) => ({ name: String(x.player?.name ?? ''), number: num(x.player?.number), pos: x.player?.pos ?? undefined, id: num(x.player?.id) })),
  }))
}

function saveExtras() {
  extrasStore().flush()
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
    if (spendExtra(api)) {
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
/** Player photos and team logos through our own domain (also for lists saved before) */
const proxiedRow = (r: LeaderRow): LeaderRow => ({ ...r, photo: proxyImage(r.photo), teamLogo: realLogo(r.teamLogo) })
export async function apiLeagueLeaders(leagueId: string, season = SEASON.slice(0, 4)): Promise<Leaders | undefined> {
  const l = await apiLeagueLeadersRaw(leagueId, season)
  return l && { scorers: l.scorers.map(proxiedRow), assists: l.assists.map(proxiedRow), yellow: l.yellow.map(proxiedRow), red: l.red.map(proxiedRow) }
}
async function apiLeagueLeadersRaw(leagueId: string, season: string): Promise<Leaders | undefined> {
  const entry = extrasStore().entries[`football|leaders|${leagueId}|${season}`]
  // Lists saved before they had player ids are fetched again, so the names can link to the players' pages
  if (entry?.leaders && Date.now() - entry.fetchedAt < 6 * 3_600_000 && entry.leaders.scorers.every((r) => r.id)) return entry.leaders
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
  if (!spendExtra(api, 4)) return entry?.leaders
  const read = (response: Raw[], value: (st: Raw) => number): LeaderRow[] =>
    response
      .map((r) => {
        const st = r.statistics?.[0] ?? {}
        return {
          id: num(r.player?.id),
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

/**
 * A football player's page: profile and statistics per competition for this
 * season and the one before, transfers and trophies (4 requests, kept a day;
 * shown old while new ones are fetched). Only on the paid plan, above the
 * reserve kept for live games.
 */
export async function apiPlayer(id: number): Promise<PlayerData | undefined> {
  const p = await apiPlayerRaw(id)
  return (
    p && {
      ...p,
      photo: proxyImage(p.photo),
      seasons: p.seasons.map((s) => ({ ...s, teamLogo: realLogo(s.teamLogo), leagueLogo: realLogo(s.leagueLogo) })),
      transfers: p.transfers.map((t) => ({ ...t, fromLogo: realLogo(t.fromLogo), toLogo: realLogo(t.toLogo) })),
    }
  )
}
async function apiPlayerRaw(id: number): Promise<PlayerData | undefined> {
  const key = `football|player|${id}`
  const entry = extrasStore().entries[key]
  if (entry?.player && Date.now() - entry.fetchedAt < 86_400_000) return entry.player
  const fresh = fetchPlayer(id).catch(() => undefined)
  return entry?.player ?? (await fresh)
}

const playersRunning = new Set<number>()
async function fetchPlayer(id: number): Promise<PlayerData | undefined> {
  const api: Api = 'football'
  const key = `${api}|player|${id}`
  const store = extrasStore()
  if (playersRunning.has(id)) return store.entries[key]?.player
  playersRunning.add(id)
  try {
    load()
    const s = mem.store[api]
    if (!keyFor(api) || !isPaid(s)) return store.entries[key]?.player
    if (!spendExtra(api, 4, 'players')) return store.entries[key]?.player
    const season = Number(SEASON.slice(0, 4))
    const [now, before, transfers, trophies] = await Promise.all([
      call(api, `/players?id=${id}&season=${season}`, 8_000),
      call(api, `/players?id=${id}&season=${season - 1}`, 8_000),
      call(api, `/transfers?player=${id}`, 8_000),
      call(api, `/trophies?player=${id}`, 8_000),
    ])
    const first = now.response?.[0] ?? before.response?.[0]
    if (!first?.player) return store.entries[key]?.player
    const p = first.player
    const rows = (r: Raw | undefined): PlayerSeasonRow[] =>
      (r?.statistics ?? [])
        .map((st: Raw) => ({
          team: String(st.team?.name ?? ''),
          teamId: num(st.team?.id),
          teamLogo: realLogo(st.team?.logo ?? undefined),
          league: String(st.league?.name ?? ''),
          leagueId: num(st.league?.id),
          leagueLogo: st.league?.logo ?? undefined,
          country: st.league?.country ?? undefined,
          season: Number(st.league?.season ?? 0),
          games: num(st.games?.appearences) ?? 0,
          lineups: num(st.games?.lineups),
          minutes: num(st.games?.minutes),
          number: num(st.games?.number),
          position: st.games?.position ?? undefined,
          rating: num(st.games?.rating),
          captain: !!st.games?.captain,
          goals: num(st.goals?.total) ?? 0,
          assists: num(st.goals?.assists) ?? 0,
          conceded: num(st.goals?.conceded),
          saves: num(st.goals?.saves),
          shots: num(st.shots?.total),
          shotsOn: num(st.shots?.on),
          passes: num(st.passes?.total),
          keyPasses: num(st.passes?.key),
          passAccuracy: num(st.passes?.accuracy),
          tackles: num(st.tackles?.total),
          interceptions: num(st.tackles?.interceptions),
          duels: num(st.duels?.total),
          duelsWon: num(st.duels?.won),
          dribbles: num(st.dribbles?.attempts),
          dribblesWon: num(st.dribbles?.success),
          foulsDrawn: num(st.fouls?.drawn),
          foulsCommitted: num(st.fouls?.committed),
          yellow: (num(st.cards?.yellow) ?? 0) + (num(st.cards?.yellowred) ?? 0),
          red: (num(st.cards?.red) ?? 0) + (num(st.cards?.yellowred) ?? 0),
          penScored: num(st.penalty?.scored),
          penMissed: num(st.penalty?.missed),
        }))
        .filter((x: PlayerSeasonRow) => x.league && (x.games > 0 || x.minutes))
    const player: PlayerData = {
      id,
      name: String(p.name ?? ''),
      firstname: p.firstname ?? undefined,
      lastname: p.lastname ?? undefined,
      age: num(p.age),
      birthDate: p.birth?.date ?? undefined,
      birthPlace: p.birth?.place ?? undefined,
      birthCountry: p.birth?.country ?? undefined,
      nationality: p.nationality ?? undefined,
      height: p.height ?? undefined,
      weight: p.weight ?? undefined,
      injured: !!p.injured,
      photo: p.photo ?? undefined,
      seasons: [...rows(now.response?.[0]), ...rows(before.response?.[0])],
      transfers: ((transfers.response?.[0]?.transfers ?? []) as Raw[])
        .map((t) => ({
          date: String(t.date ?? ''),
          type: t.type ?? undefined,
          from: String(t.teams?.out?.name ?? ''),
          fromLogo: realLogo(t.teams?.out?.logo ?? undefined),
          to: String(t.teams?.in?.name ?? ''),
          toLogo: realLogo(t.teams?.in?.logo ?? undefined),
        }))
        .filter((t) => t.date && t.to)
        .sort((a, b) => b.date.localeCompare(a.date)),
      trophies: ((trophies.response ?? []) as Raw[])
        .map((t) => ({ league: String(t.league ?? ''), country: t.country ?? undefined, season: String(t.season ?? ''), place: String(t.place ?? '') }))
        .filter((t) => t.league && t.place),
    }
    store.entries[key] = { fetchedAt: Date.now(), player }
    saveExtras()
    return player
  } finally {
    playersRunning.delete(id)
  }
}

// ---------------------------------------------------------------- team statistics and injuries

/** The source's team id for one of our clubs in a league: from the league's saved games */
export function apiTeamIdOf(leagueId: string, names: string[]): number | undefined {
  load()
  const s = mem.store.football
  if (!s) return undefined
  const games = [...Object.values(s.days).flatMap((d) => d.games), ...Object.values(s.past ?? {}).flat()].filter((g) => String(g.league.id) === String(leagueId))
  for (const g of games) {
    for (const t of [g.home, g.away]) if (t.id && alike(names, t.name)) return t.id
  }
  return undefined
}

/** Spends one request on an extra when the paid plan has calls above the reserve */
function extraAllowed(api: Api) {
  load()
  if (!keyFor(api) || !isPaid(mem.store[api])) return false
  return spendExtra(api)
}

function saveExtrasSoon() {
  try {
    saveExtras()
  } catch {
    // kept in memory
  }
}

const extrasRunning = new Set<string>()
/** A cached extra: fresh within `maxAge`; stale ones are shown while a new one is fetched in the background */
async function cachedExtra<T>(key: string, maxAge: number, pick: (e: ExtraStore['entries'][string]) => T | undefined, fetchNow: () => Promise<T | undefined>): Promise<T | undefined> {
  const entry = extrasStore().entries[key]
  const have = entry ? pick(entry) : undefined
  if (have !== undefined && Date.now() - entry!.fetchedAt < maxAge) return have
  const fresh = (async () => {
    if (extrasRunning.has(key) || !extraAllowed('football')) return have
    extrasRunning.add(key)
    try {
      return (await fetchNow()) ?? have
    } finally {
      extrasRunning.delete(key)
    }
  })().catch(() => have)
  return have ?? (await fresh)
}

const periods = (o: Raw | undefined): Periods =>
  Object.entries(o ?? {})
    .filter(([k]) => /^\d+-\d+$/.test(k))
    .map(([period, v]) => ({ period, value: Number((v as Raw)?.total ?? 0) }))
const hat = (o: Raw | undefined) => ({ home: Number(o?.home ?? 0), away: Number(o?.away ?? 0), total: Number(o?.total ?? 0) })

/** A team's season statistics in a league (one request, kept a day) */
export async function apiTeamStats(leagueId: string, teamId: number, season = SEASON.slice(0, 4)): Promise<TeamStats | undefined> {
  const key = `football|teamstats|${leagueId}|${season}|${teamId}`
  return cachedExtra(key, 86_400_000, (e) => e.teamStats, async () => {
    const { response, error } = await call('football', `/teams/statistics?league=${leagueId}&season=${season}&team=${teamId}`, 8_000)
    const r = (response as unknown as Raw | undefined) ?? undefined
    if (error || !r || Array.isArray(r) || !r.fixtures) return undefined
    const stats: TeamStats = {
      played: hat(r.fixtures?.played),
      wins: hat(r.fixtures?.wins),
      draws: hat(r.fixtures?.draws),
      loses: hat(r.fixtures?.loses),
      goalsFor: { ...hat(r.goals?.for?.total), average: num(r.goals?.for?.average?.total), periods: periods(r.goals?.for?.minute) },
      goalsAgainst: { ...hat(r.goals?.against?.total), average: num(r.goals?.against?.average?.total), periods: periods(r.goals?.against?.minute) },
      cleanSheets: hat(r.clean_sheet),
      failedToScore: hat(r.failed_to_score),
      biggestWin: { home: r.biggest?.wins?.home ?? undefined, away: r.biggest?.wins?.away ?? undefined },
      biggestLoss: { home: r.biggest?.loses?.home ?? undefined, away: r.biggest?.loses?.away ?? undefined },
      streak: { wins: Number(r.biggest?.streak?.wins ?? 0), draws: Number(r.biggest?.streak?.draws ?? 0), loses: Number(r.biggest?.streak?.loses ?? 0) },
      penalty: { scored: Number(r.penalty?.scored?.total ?? 0), missed: Number(r.penalty?.missed?.total ?? 0), total: Number(r.penalty?.total ?? 0) },
      yellow: periods(r.cards?.yellow),
      red: periods(r.cards?.red),
      formations: ((r.lineups ?? []) as Raw[]).map((l) => ({ formation: String(l.formation ?? ''), played: Number(l.played ?? 0) })).filter((l) => l.formation),
      form: r.form ?? undefined,
    }
    const store = extrasStore()
    store.entries[key] = { fetchedAt: Date.now(), teamStats: stats }
    saveExtrasSoon()
    return stats
  })
}

/** The minutes of the own goals in a team's league matches this season, from the games the job has kept (no request) */
export function apiTeamOwnGoals(leagueId: string, teamId: number, season = SEASON.slice(0, 4)): number[] {
  const out: number[] = []
  for (const g of seasonGames()) {
    if (String(g.league.id) !== String(leagueId) || String(g.league.season ?? season) !== season || (g.home.id !== teamId && g.away.id !== teamId)) continue
    // Either side's: the source files an own goal now under the scorer's team, now under the other (checkedTeamStats works out which way)
    for (const i of g.incidents ?? []) if (i.kind === 'own-goal') out.push(i.minute)
  }
  return out
}

export interface SquadPlayer {
  /** API-Sports' player id (the player's page) */
  id: number
  name: string
  /** The player's photo through our own domain */
  photo?: string
  number?: number
  /** G, D, M or F */
  pos?: string
  /** Matches from the start, and matches he came on in */
  starts: number
  subbedOn: number
  goals: number
}

const plainName = (n: string) => n.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/ø/g, 'o').replace(/æ/g, 'ae').replace(/å/g, 'a').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim()
/** "Marcus Younis" and "M. Younis": the same words, or the same last name and first letter */
function samePlayer(a: string, b: string) {
  const [x, y] = [plainName(a), plainName(b)]
  if (!x || !y) return false
  if (x === y) return true
  const [xw, yw] = [x.split(' '), y.split(' ')]
  return xw.length > 1 && yw.length > 1 && xw[xw.length - 1] === yw[yw.length - 1] && xw[0][0] === yw[0][0]
}

/**
 * The players a team has used in its league matches this season: everyone in a starting eleven or on a bench, with
 * matches from the start, matches come on in and goals. From the line-ups, substitutions and goals saved with the
 * matches (no request), so a player who has not been in a match squad yet is not here. The name is the full one
 * where the player's profile is saved, else the line-up's ("P. Pentz").
 */
export function apiTeamSquad(leagueId: string, teamId: number, season = SEASON.slice(0, 4)): SquadPlayer[] {
  const store = extrasStore()
  const players = new Map<number, SquadPlayer>()
  const games = seasonGames()
    .filter((g) => g.state === 'finished' && String(g.league.id) === String(leagueId) && String(g.league.season ?? season) === season && (g.home.id === teamId || g.away.id === teamId))
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff))
  for (const g of games) {
    const lineups = store.entries[`football|lineups|${g.id}`]?.lineups
    if (!lineups || lineups.length !== 2) continue
    const side = g.home.id === teamId ? 'home' : 'away'
    const own = side === 'home' ? g.home.name : g.away.name
    // By the team's name, else in the source's order (home first)
    const lineup = lineups.find((l) => l.team.toLowerCase() === own.toLowerCase()) ?? lineups[side === 'home' ? 0 : 1]
    const subs = (store.entries[`football|subs|${g.id}`]?.subs ?? []).filter((x) => x.side === side)
    const goals = (g.incidents ?? []).filter((i) => i.side === side && i.player && (i.kind === 'goal' || i.kind === 'penalty'))
    const seen = (p: LineupPlayer, started: boolean) => {
      if (!p.id || !p.name) return
      const row = players.get(p.id) ?? players.set(p.id, { id: p.id, name: p.name, starts: 0, subbedOn: 0, goals: 0 }).get(p.id)!
      // The newest match's number and position
      row.number = p.number ?? row.number
      row.pos = p.pos ?? row.pos
      if (started) row.starts++
      else if (subs.some((x) => plainName(x.on) === plainName(p.name))) row.subbedOn++
    }
    for (const p of lineup.startXI) seen(p, true)
    for (const p of lineup.substitutes) seen(p, false)
    // A goal counts for the one player in the match squad it fits
    const squad = [...lineup.startXI, ...lineup.substitutes].filter((p) => p.id)
    for (const i of goals) {
      // The same name first ("M. Jensen" is not "M. Frokjaer-Jensen"), then the same last name and first letter
      const exact = squad.filter((p) => plainName(p.name) === plainName(i.player!))
      const hits = exact.length ? exact : squad.filter((p) => samePlayer(p.name, i.player!))
      if (hits.length === 1) players.get(hits[0].id!)!.goals++
    }
  }
  // The league's own top scorer list where it has the player (it counts a goal the events file as an own goal or under another name)
  for (const r of store.entries[`football|leaders|${leagueId}|${season}`]?.leaders?.scorers ?? []) {
    const row = r.id ? players.get(r.id) : undefined
    if (row && r.value > row.goals) row.goals = r.value
  }
  for (const row of players.values()) {
    const full = store.entries[`football|player|${row.id}`]?.player?.name
    if (full && !/\.\s/.test(full)) row.name = full
    // The source has a photo of every player under his id
    row.photo = proxyImage(`https://media.api-sports.io/football/players/${row.id}.png`)
  }
  return [...players.values()]
}

/** Injured and suspended players in a league this season, per match (one request, kept 6 hours) */
export async function apiInjuries(leagueId: string, season = SEASON.slice(0, 4)): Promise<Injury[] | undefined> {
  return (await apiInjuriesRaw(leagueId, season))?.map((i) => ({ ...i, photo: proxyImage(i.photo) }))
}
async function apiInjuriesRaw(leagueId: string, season: string): Promise<Injury[] | undefined> {
  const key = `football|injuries|${leagueId}|${season}`
  return cachedExtra(key, 6 * 3_600_000, (e) => e.injuries, async () => {
    const { response, error } = await call('football', `/injuries?league=${leagueId}&season=${season}`, 10_000)
    if (error || !Array.isArray(response)) return undefined
    const from = Date.now() - 30 * 86_400_000
    const injuries: Injury[] = response
      .map((r) => ({
        playerId: num(r.player?.id),
        player: String(r.player?.name ?? ''),
        photo: r.player?.photo ?? undefined,
        teamId: num(r.team?.id),
        team: String(r.team?.name ?? ''),
        type: String(r.player?.type ?? ''),
        reason: String(r.player?.reason ?? ''),
        fixtureId: num(r.fixture?.id),
        date: String(r.fixture?.date ?? ''),
      }))
      // Only the last month and what is ahead: the list covers the whole season
      .filter((i) => i.player && Date.parse(i.date) >= from)
    const store = extrasStore()
    store.entries[key] = { fetchedAt: Date.now(), injuries }
    saveExtrasSoon()
    return injuries
  })
}

/** A team's missing players for its next match (or the one being played), newest list of the source */
export function injuriesForTeam(injuries: Injury[] | undefined, teamId: number | undefined, now = Date.now()): { date?: string; list: Injury[] } {
  if (!injuries || !teamId) return { list: [] }
  const own = injuries.filter((i) => i.teamId === teamId)
  // The team's next match with a list (from 3 hours back, so a match being played counts)
  const dates = [...new Set(own.map((i) => i.date))].filter((d) => Date.parse(d) >= now - 3 * 3_600_000).sort()
  const date = dates[0]
  return { date, list: date ? own.filter((i) => i.date === date) : [] }
}

// ---------------------------------------------------------------- connection test (/admin/data)

export interface ApiStatus {
  api: Api
  label: string
  ok: boolean
  plan?: string
  active?: boolean
  end?: string
  used?: number
  limit?: number
  error?: string
}

/**
 * Asks each sport's /status with its key: the plan, whether it is active, and
 * today's calls. The status call does not count against the day's calls.
 */
export async function apiStatus(): Promise<ApiStatus[]> {
  const out: ApiStatus[] = []
  for (const api of Object.keys(APIS) as Api[]) {
    const def = APIS[api]
    const key = keyFor(api)
    if (!key) {
      out.push({ api, label: def.label, ok: false, error: 'Ingen nøgle' })
      continue
    }
    try {
      const res = await fetch(`${def.base}/status`, { headers: { 'x-apisports-key': key }, signal: AbortSignal.timeout(15_000), cache: 'no-store' })
      const body = (await res.json().catch(() => ({}))) as {
        errors?: Record<string, string> | string[]
        response?:
          | { subscription?: { plan?: string; end?: string; active?: boolean }; requests?: { current?: number; limit_day?: number } }
          | { subscription?: { plan?: string; end?: string; active?: boolean }; requests?: { current?: number; limit_day?: number } }[]
      }
      const errors = Array.isArray(body.errors) ? body.errors : Object.values(body.errors ?? {})
      const r = Array.isArray(body.response) ? body.response[0] : body.response
      const error = !res.ok ? `HTTP ${res.status}` : errors.length ? errors.join(', ') : !r ? 'Intet svar' : undefined
      out.push({
        api,
        label: def.label,
        ok: !error && r?.subscription?.active !== false,
        plan: r?.subscription?.plan,
        active: r?.subscription?.active,
        end: r?.subscription?.end,
        used: r?.requests?.current,
        limit: r?.requests?.limit_day,
        error: error ?? (r?.subscription?.active === false ? 'Abonnementet er ikke aktivt' : undefined),
      })
    } catch (e) {
      out.push({ api, label: def.label, ok: false, error: e instanceof Error ? e.message : String(e) })
    }
  }
  return out
}
