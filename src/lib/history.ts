import 'server-only'
import { timed } from './slow'
import { existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { DIVISIONS, SEASON, seasonOf, sportOf, type Club } from '../data/leagues'
import type { RealEvent } from '../data/real'
import type { Incident, Match, MatchState, SportId } from '../types'
import { alike, normalize, clubNames } from '../data/aliases'
import type { PastMatch } from '../data/matchInsights'
import type { ExternalGame } from '../data/external'
import type { FormGame, MatchExtra, TableRow } from '../data/matchExtra'
import type { Baseline } from '../data/baselines'
import { cacheDir } from './tsdb'
import { archiveDetailedEvents, archiveFile, archiveIncidents, intern, readArchive, type ArchivedMatch } from './archive'
import { hashString } from '../data/fixtures'
import { cupOfGame } from '../data/cups'
import { matchSlug } from './slug'
import { NOT_LEAGUE_ROUND, allSeasonGames, checkSeason, savedSeasons } from './seasonCheck'
import { historyOfficial, type HistoryScorer } from './apisports'
import { isoDate } from './time'
import { realLogo } from './logoCheck'

// Our match database (SQLite, read-only): /opt/scoreline/data/football.db on
// the VPS, or STATS_DB. It has the tables `matches` (one row per match) and
// `incidents` (goals etc.). Its teams are matched to our clubs by name. It
// gives head-to-heads, club history and this season's fixtures for Danish
// divisions TheSportsDB does not cover.

export const historyFile = (): string =>
  process.env.STATS_DB ?? path.join(/*turbopackIgnore: true*/ cacheDir(), 'data', 'football.db')

interface DbMatch {
  id: number
  tournamentId: number
  tournament: string
  seasonId: number
  season: string
  date: Date
  homeId: number
  homeName: string
  awayId: number
  awayName: string
  homeScore: number
  awayScore: number
  spectators?: number
  /** football.db is football; the statistics bank has every sport */
  sport: SportId
  /** The statistics bank's league id (ours, or "ext-<api>-<id>"); football.db's matches have none */
  divisionId?: string
  /** The statistics bank's event id (its goals and cards); football.db's matches use `id` */
  eventId?: string
}

/** The sport of a league id in the statistics bank: one of ours, or API-Sports' ("ext-basketball-12") */
const API_SPORTS: Record<string, SportId> = { football: 'soccer', basketball: 'basketball', nba: 'basketball', hockey: 'ice_hockey', handball: 'handball', volleyball: 'volleyball', nfl: 'american_football' }
function sportOfDivisionId(id: string): SportId | undefined {
  const ours = DIVISIONS.find((d) => d.id === id)
  if (ours) return sportOf(ours)
  const api = /^ext-([a-z]+)-/.exec(id)?.[1]
  return api ? API_SPORTS[api] : undefined
}

interface Loaded {
  mtime: number
  /** football.db's modification time, and when the data was read (the archive is re-read at most every hour) */
  dbTime?: number
  readAt?: number
  matches: DbMatch[]
  /** Database team id -> our club */
  clubOf: Map<number, Club>
  /** Our club id -> its matches, newest first */
  byClub: Map<string, DbMatch[]>
  unmatched: string[]
}

type Row = Record<string, unknown>
interface Db {
  prepare(sql: string): { all(): Row[] }
  close(): void
}

// On globalThis: the background jobs (started from instrumentation) and the pages load separate copies of this module, and the data is big
const historyHolder = globalThis as typeof globalThis & {
  __scorelineHistory?: { loaded?: Loaded; checkedAt: number; lastError?: string }
  __scorelineHistoryDb?: { dbTime: number; rows: DbMatch[] }
  __scorelineHistoryRows?: WeakMap<ArchivedMatch, DbMatch>
  __scorelinePast?: { loaded: Loaded; bySlug: Map<string, PastGame>; list: PastGame[] }
  __scorelineSeason?: SeasonData
  __scorelineResolved?: Map<SportId, Map<string, Club | undefined>>
  __scorelineResolvedAt?: number
}
const hist = (historyHolder.__scorelineHistory ??= { checkedAt: 0 })

/** Finds our club for a team name, among the clubs of one sport (a football team is never a basketball club of the same town) */
function resolver(sport: SportId = 'soccer') {
  const byName = new Map<string, Club>()
  // Danish football first (football.db is Danish football), then every other league (the archive has them all)
  const same = DIVISIONS.filter((d) => sportOf(d) === sport)
  const ordered = [...same.filter((d) => d.countryCode === 'DK'), ...same.filter((d) => d.countryCode !== 'DK')]
  for (const d of ordered) {
    for (const club of d.clubs) {
      for (const n of clubNames(club)) {
        const key = n && normalize(n)
        if (key && !byName.has(key)) byName.set(key, club)
      }
    }
  }
  const danish = same.filter((d) => d.countryCode === 'DK').flatMap((d) => d.clubs)
  const everyone = same.flatMap((d) => d.clubs)
  // Each name is looked up once, also across rebuilds (on globalThis): the loose matching below is too slow to repeat
  // Cleared every six hours, so clubs renamed in the admin are found again
  if (Date.now() - (historyHolder.__scorelineResolvedAt ?? 0) > 6 * 3_600_000) {
    historyHolder.__scorelineResolved = new Map()
    historyHolder.__scorelineResolvedAt = Date.now()
  }
  const memos = (historyHolder.__scorelineResolved ??= new Map())
  const memo = memos.get(sport) ?? memos.set(sport, new Map()).get(sport)!
  return (name: string) => {
    if (memo.has(name)) return memo.get(name)
    const found = look(name)
    memo.set(name, found)
    return found
  }
  function look(name: string): Club | undefined {
    const exact = byName.get(normalize(name))
    if (exact) return exact
    // Written differently ("AGF Aarhus" for AGF): one Danish club alone matches loosely. Second teams and youth sides never do
    if (/\b(ii|iii|2|u\s?\d{2}|reserve|ungdom)\b/i.test(name)) return undefined
    const names = (c: Club) => clubNames(c)
    // Danish football first (football.db), then any of our clubs (past seasons of the other leagues in the statistics bank)
    const loose = danish.filter((c) => alike(names(c), name))
    if (loose.length === 1) return loose[0]
    if (loose.length) return undefined
    const other = everyone.filter((c) => alike(names(c), name))
    return other.length === 1 ? other[0] : undefined
  }
}

/** football.db's finished matches, read again only when the file changes */
function dbRows(file: string | undefined): DbMatch[] {
  if (!file) return []
  const dbTime = statSync(file).mtimeMs
  const cached = historyHolder.__scorelineHistoryDb
  if (cached?.dbTime === dbTime) return cached.rows
  const sqlite = process.getBuiltinModule?.('node:sqlite') as { DatabaseSync: new (f: string, o: { readOnly: boolean }) => Db } | undefined
  if (!sqlite) throw new Error(`Node ${process.version} kan ikke læse SQLite – kræver Node 22.13 eller nyere`)
  let rows: Row[] = []
  const db = new sqlite.DatabaseSync(file, { readOnly: true })
  try {
    rows = db
      .prepare(
        `SELECT event_id, tournament_id, tournament_name, season_id, season_year, start_date, home_id, home_name,
                away_id, away_name, home_score, away_score, spectators
           FROM matches
          WHERE status = 'finished' AND home_score IS NOT NULL AND away_score IS NOT NULL
          ORDER BY start_date DESC`,
      )
      .all()
  } finally {
    db.close()
  }
  const text = (v: unknown) => intern(String(v ?? ''))
  const out: DbMatch[] = rows.map((r) => ({
    id: Number(r.event_id),
    tournamentId: Number(r.tournament_id),
    tournament: text(r.tournament_name),
    seasonId: Number(r.season_id),
    season: text(r.season_year),
    date: new Date(String(r.start_date)),
    homeId: Number(r.home_id),
    homeName: text(r.home_name),
    awayId: Number(r.away_id),
    awayName: text(r.away_name),
    homeScore: Number(r.home_score),
    awayScore: Number(r.away_score),
    spectators: r.spectators == null ? undefined : Number(r.spectators),
    sport: 'soccer' as SportId,
  }))
  historyHolder.__scorelineHistoryDb = { dbTime, rows: out }
  return out
}

function read(file: string | undefined, mtime: number): Loaded {
  const fromDb = dbRows(file)

  // Our own statistics bank: every other league, and anything football.db no longer has
  const seen = new Set(fromDb.map((m) => matchKey(m.date.toISOString(), m.homeName, m.awayName)))
  // A team is its name within its sport ("Randers" in football is not "Randers" in basketball)
  const teamId = (sport: SportId, name: string) => -hashString(`${sport}|${normalize(name)}`)
  // The same archive row gives the same match object each time (the archive keeps its rows between reads)
  const made = (historyHolder.__scorelineHistoryRows ??= new WeakMap())
  const fromArchive: DbMatch[] = []
  for (const a of readArchive()) {
    if (seen.has(matchKey(a.date.toISOString(), a.homeName, a.awayName))) continue
    const have = made.get(a)
    if (have) {
      fromArchive.push(have)
      continue
    }
    const sport = sportOfDivisionId(a.divisionId)
    if (!sport) continue
    const m: DbMatch = {
      id: -hashString(a.id),
      tournamentId: -hashString(a.divisionId),
      tournament: a.tournament,
      seasonId: -hashString(a.season),
      season: a.season,
      date: a.date,
      homeId: teamId(sport, a.homeName),
      homeName: a.homeName,
      awayId: teamId(sport, a.awayName),
      awayName: a.awayName,
      homeScore: a.homeScore,
      awayScore: a.awayScore,
      spectators: a.spectators,
      sport,
      divisionId: a.divisionId,
      eventId: a.id,
    }
    made.set(a, m)
    fromArchive.push(m)
  }
  const matches = [...fromDb, ...fromArchive].sort((a, b) => b.date.getTime() - a.date.getTime())

  // Newest name per team id (clubs get renamed), then matched to our register
  const names = new Map<number, { name: string; sport: SportId }>()
  for (const m of matches) {
    if (!names.has(m.homeId)) names.set(m.homeId, { name: m.homeName, sport: m.sport })
    if (!names.has(m.awayId)) names.set(m.awayId, { name: m.awayName, sport: m.sport })
  }
  const finders = new Map<SportId, ReturnType<typeof resolver>>()
  const find = (name: string, sport: SportId) => (finders.get(sport) ?? finders.set(sport, resolver(sport)).get(sport)!)(name)
  const clubOf = new Map<number, Club>()
  const unmatched: string[] = []
  for (const [id, { name, sport }] of names) {
    const club = find(name, sport)
    if (club) clubOf.set(id, club)
    else unmatched.push(name)
  }
  const byClub = new Map<string, DbMatch[]>()
  for (const m of matches) {
    const clubs = new Set([clubOf.get(m.homeId)?.id, clubOf.get(m.awayId)?.id])
    for (const id of clubs) {
      if (!id) continue
      if (!byClub.has(id)) byClub.set(id, [])
      byClub.get(id)!.push(m)
    }
  }
  return { mtime, matches, clubOf, byClub, unmatched: unmatched.sort((a, b) => a.localeCompare(b, 'da')) }
}

/** After names are added in the admin pages: every team name is looked up again, and the data rebuilt */
export function forgetResolvedNames() {
  historyHolder.__scorelineResolvedAt = 0
  hist.checkedAt = 0
  if (hist.loaded) hist.loaded = { ...hist.loaded, readAt: 0, mtime: -1 }
}

/** The database in memory; re-read when the file changes (checked at most once a minute) */
function data(): Loaded | undefined {
  const now = Date.now()
  if (hist.loaded && now - hist.checkedAt < 60_000) return hist.loaded
  hist.checkedAt = now
  const file = historyFile()
  try {
    const hasDb = existsSync(file)
    const hasArchive = existsSync(archiveFile())
    if (!hasDb && !hasArchive) {
      hist.lastError = `Filen ${file} findes ikke`
      hist.loaded = undefined
      return undefined
    }
    // Re-read when football.db has changed, or the archive (which changes all the time) at most every hour (a rebuild takes seconds)
    const dbTime = hasDb ? statSync(file).mtimeMs : 0
    const mtime = dbTime + (hasArchive ? statSync(archiveFile()).mtimeMs / 1000 : 0)
    const stale = !hist.loaded || hist.loaded.dbTime !== dbTime || (hist.loaded.mtime !== mtime && now - (hist.loaded.readAt ?? 0) > 60 * 60_000)
    if (stale) hist.loaded = { ...timed('Historik bygges (football.db + statistikbank)', () => read(hasDb ? file : undefined, mtime)), dbTime, readAt: now }
    hist.lastError = hasDb ? undefined : `Filen ${file} findes ikke (bruger kun statistikbanken)`
  } catch (err) {
    hist.lastError = (err as Error).message
  }
  return hist.loaded
}

const nameOf = (d: Loaded, id: number, fallback: string) => d.clubOf.get(id)?.name ?? fallback

/**
 * The last `count` real meetings between two of our clubs before `before`.
 * Undefined when the database is missing or one of the clubs is not in it,
 * so the caller can fall back.
 */
export function realHeadToHead(clubA: Club, clubB: Club, before: Date, count = 5): PastMatch[] | undefined {
  const d = data()
  const own = d?.byClub.get(clubA.id)
  if (!d || !own || !d.byClub.has(clubB.id)) return undefined
  return own
    .filter((m) => m.date < before && [m.homeId, m.awayId].some((id) => d.clubOf.get(id)?.id === clubB.id))
    .slice(0, count)
    .map((m) => ({
      date: m.date,
      competition: m.tournament,
      home: nameOf(d, m.homeId, m.homeName),
      away: nameOf(d, m.awayId, m.awayName),
      homeScore: m.homeScore,
      awayScore: m.awayScore,
    }))
}

export interface SeasonRecord {
  season: string
  tournament: string
  position?: number
  /** The database lacks some of the season's matches (no position then) */
  incomplete?: boolean
  /** A season between others with no matches in the database */
  missing?: boolean
  teams: number
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  points: number
}

export interface ClubHistory {
  total: Omit<SeasonRecord, 'season' | 'tournament' | 'position' | 'teams' | 'points'>
  seasons: SeasonRecord[]
  biggestWin?: PastMatch
  first: Date
  last: Date
}

function tally(rec: Pick<SeasonRecord, 'played' | 'won' | 'drawn' | 'lost' | 'goalsFor' | 'goalsAgainst'>, f: number, a: number) {
  rec.played++
  rec.goalsFor += f
  rec.goalsAgainst += a
  if (f > a) rec.won++
  else if (f < a) rec.lost++
  else rec.drawn++
}

const empty = () => ({ played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 })

/** Final league position of every team in one tournament season, by points, goal difference and goals */
/** Most matches any team has in a tournament's season in the database */
function mostPlayed(d: Loaded, tournamentId: number, seasonId: number): number {
  const played = new Map<number, number>()
  for (const m of d.matches) {
    if (m.tournamentId !== tournamentId || m.seasonId !== seasonId) continue
    played.set(m.homeId, (played.get(m.homeId) ?? 0) + 1)
    played.set(m.awayId, (played.get(m.awayId) ?? 0) + 1)
  }
  return Math.max(0, ...played.values())
}

function finalTable(d: Loaded, tournamentId: number, seasonId: number): number[] {
  const rows = new Map<number, ReturnType<typeof empty> & { id: number; points: number }>()
  const row = (id: number) => rows.get(id) ?? rows.set(id, { id, points: 0, ...empty() }).get(id)!
  for (const m of d.matches) {
    if (m.tournamentId !== tournamentId || m.seasonId !== seasonId) continue
    const h = row(m.homeId)
    const a = row(m.awayId)
    tally(h, m.homeScore, m.awayScore)
    tally(a, m.awayScore, m.homeScore)
    h.points += m.homeScore > m.awayScore ? 3 : m.homeScore === m.awayScore ? 1 : 0
    a.points += m.awayScore > m.homeScore ? 3 : m.homeScore === m.awayScore ? 1 : 0
  }
  return [...rows.values()]
    .sort((x, y) => y.points - x.points || y.goalsFor - y.goalsAgainst - (x.goalsFor - x.goalsAgainst) || y.goalsFor - x.goalsFor)
    .map((r) => r.id)
}

const historyCache = new Map<string, { mtime: number; history?: ClubHistory }>()

/** A club's real record, season by season, from the database */
export function clubHistory(club: Club): ClubHistory | undefined {
  const d = data()
  // Finished seasons only: the season being played has its own statistics
  const current = SEASON.slice(0, 4)
  const played = d?.byClub.get(club.id)?.filter((m) => !m.season.startsWith(current))
  if (!d || !played?.length) return undefined
  // A season in two divisions is the club and its reserve side: the lower division's matches are the second team's
  const rankOf = (m: DbMatch) => DIVISION_TOURNAMENTS.findIndex(([id, re]) => (m.divisionId ? m.divisionId === id : re.test(m.tournament)))
  const top = new Map<string, number>()
  for (const m of played) {
    const r = rankOf(m)
    if (r >= 0 && !/kvinde|women|u\s?\d{2}/i.test(m.tournament)) top.set(m.season, Math.min(top.get(m.season) ?? r, r))
  }
  const own = played.filter((m) => {
    const r = rankOf(m)
    return r < 0 || r <= (top.get(m.season) ?? r)
  })
  const hit = historyCache.get(club.id)
  if (hit && hit.mtime === d.mtime) return hit.history

  const total = empty()
  const seasons = new Map<string, SeasonRecord & { tournamentId: number; seasonId: number; dbId: number }>()
  let biggest: DbMatch | undefined
  const margin = (m: DbMatch) => {
    const home = d.clubOf.get(m.homeId)?.id === club.id
    return home ? m.homeScore - m.awayScore : m.awayScore - m.homeScore
  }
  for (const m of own) {
    const home = d.clubOf.get(m.homeId)?.id === club.id
    const [f, a] = home ? [m.homeScore, m.awayScore] : [m.awayScore, m.homeScore]
    tally(total, f, a)
    const key = `${m.tournamentId}|${m.seasonId}`
    const s =
      seasons.get(key) ??
      seasons
        .set(key, {
          season: m.season,
          tournament: m.tournament,
          teams: 0,
          points: 0,
          tournamentId: m.tournamentId,
          seasonId: m.seasonId,
          dbId: home ? m.homeId : m.awayId,
          ...empty(),
        })
        .get(key)!
    tally(s, f, a)
    s.points += f > a ? 3 : f === a ? 1 : 0
    if (margin(m) > 0 && (!biggest || margin(m) > margin(biggest))) biggest = m
  }
  const list: SeasonRecord[] = [...seasons.values()].map(({ tournamentId, seasonId, dbId, ...s }) => {
    const table = finalTable(d, tournamentId, seasonId)
    // A position only makes sense for league play, where everyone plays everyone
    const league = s.played >= table.length - 1 && table.length >= 6
    // Fewer matches than the others, or not even a full double round: the database lacks matches
    const incomplete = league && (s.played < mostPlayed(d, tournamentId, seasonId) || s.played < 2 * (table.length - 1))
    return { ...s, teams: table.length, incomplete, position: league && !incomplete ? table.indexOf(dbId) + 1 : undefined }
  })
  // Seasons in between with no matches at all: shown, so a gap in the data doesn't read as a gap in the club's history
  const split = list.map((x) => /^(\d{4})\/(\d{2}|\d{4})$/.exec(x.season)).filter((m): m is RegExpExecArray => !!m)
  if (split.length) {
    const years = split.map((m) => Number(m[1]))
    const short = split[0][2].length === 2
    const have = new Set(years)
    for (let y = Math.min(...years) + 1; y < Math.max(...years); y++) {
      if (!have.has(y))
        list.push({ season: `${y}/${short ? String(y + 1).slice(2) : y + 1}`, tournament: '', teams: 0, points: 0, missing: true, ...empty() })
    }
  }
  list.sort((x, y) => y.season.localeCompare(x.season) || (x.position ? 0 : 1) - (y.position ? 0 : 1))
  const history: ClubHistory = {
    total,
    seasons: list,
    biggestWin: biggest && {
      date: biggest.date,
      competition: biggest.tournament,
      home: nameOf(d, biggest.homeId, biggest.homeName),
      away: nameOf(d, biggest.awayId, biggest.awayName),
      homeScore: biggest.homeScore,
      awayScore: biggest.awayScore,
    },
    first: own[own.length - 1].date,
    last: own[0].date,
  }
  historyCache.set(club.id, { mtime: d.mtime, history })
  return history
}

/** Numbers for the status page */
export function historyStatus() {
  const d = data()
  const tournaments = new Map<string, number>()
  for (const m of d?.matches ?? []) tournaments.set(m.tournament, (tournaments.get(m.tournament) ?? 0) + 1)
  return {
    file: historyFile(),
    error: hist.lastError ?? null,
    matches: d?.matches.length ?? 0,
    from: d?.matches.at(-1)?.date.toISOString().slice(0, 10) ?? null,
    to: d?.matches[0]?.date.toISOString().slice(0, 10) ?? null,
    tournaments: [...tournaments.entries()].sort((a, b) => b[1] - a[1]),
    clubs: d ? new Set([...d.clubOf.values()].map((c) => c.id)).size : 0,
    season: Object.entries(databaseSeason()?.leagues ?? {}).map(([id, ev]) => ({ id, events: ev.length, finished: ev.filter((e) => e.state === 'finished').length })),
    seasonTournaments: databaseSeason()?.tournaments ?? [],
    unmatched: d?.unmatched ?? [],
  }
}

// ---------------------------------------------------------------- this season from the database

/** Our Danish divisions and the tournament names they have in the database */
const DIVISION_TOURNAMENTS: [string, RegExp][] = [
  ['superliga', /superliga/i],
  ['1div', /^(1\.?\s*div|nordicbet liga|betinia liga)/i],
  ['2div', /^2\.?\s*div/i],
  ['3div', /^3\.?\s*div/i],
]

const STATE: Record<string, MatchState> = {
  finished: 'finished',
  notstarted: 'upcoming',
  inprogress: 'live',
  postponed: 'postponed',
  canceled: 'postponed',
  cancelled: 'postponed',
  interrupted: 'postponed',
  abandoned: 'postponed',
}

/** Goals and cards from the database's incident text ("Regular goal", "Yellow card", …) */
function incidentKind(type: string, subtype: string): Incident['kind'] | undefined {
  const t = `${type} ${subtype}`.toLowerCase()
  if (/miss|saved|disallow|cancel|var/.test(t)) return undefined
  if (/own/.test(t)) return 'own-goal'
  if (/penalty/.test(t) && /goal/.test(t)) return 'penalty'
  if (/goal/.test(t)) return 'goal'
  if (/yellow.?red|second yellow|2nd yellow/.test(t)) return 'red'
  if (/red/.test(t)) return 'red'
  if (/yellow/.test(t)) return 'yellow'
  return undefined
}

type SeasonData = {
  mtime: number
  key: string
  leagues: Record<string, RealEvent[]>
  tournaments: string[]
  /** Goals, cards, half-time score and attendance by "date|home|away" (club id or normalised name), for other sources' matches */
  extrasByMatch: Map<string, Pick<RealEvent, 'incidents' | 'ht' | 'spectators'>>
  /** Cup games this season (src/data/cups.ts), in the shape of API-Sports' games */
  cups: ExternalGame[]
  /** The same, as a list (for matching names written differently) */
  extrasList: { kickoff: string; home: string; away: string; extras: Pick<RealEvent, 'incidents' | 'ht' | 'spectators'> }[]
}

/** Key for finding the same match across sources */
export function matchKey(kickoff: string, home: string, away: string) {
  const find = clubFinder()
  const id = (n: string) => find(n)?.id ?? normalize(n)
  return `${kickoff.slice(0, 10)}|${id(home)}|${id(away)}`
}
let finder: ReturnType<typeof resolver> | undefined
const clubFinder = () => (finder ??= resolver())

/**
 * Every match of the current season (played and coming) in the Danish divisions,
 * from the database. Used for leagues TheSportsDB has no fixtures for.
 */
export function databaseSeason(): SeasonData | undefined {
  const d = data()
  if (!d) return undefined
  if (historyHolder.__scorelineSeason?.mtime === d.mtime) return historyHolder.__scorelineSeason
  const sqlite = process.getBuiltinModule?.('node:sqlite') as { DatabaseSync: new (f: string, o: { readOnly: boolean }) => Db } | undefined
  if (!sqlite || !existsSync(historyFile())) return undefined
  const year = SEASON.slice(0, 4)
  const db = new sqlite.DatabaseSync(historyFile(), { readOnly: true })
  let rows: Row[]
  let incidentRows: Row[] = []
  try {
    rows = db
      .prepare(
        `SELECT event_id, tournament_name, round, start_date, home_name, away_name, home_score, away_score,
                home_score_ht, away_score_ht, spectators, status
           FROM matches WHERE substr(season_year, 1, 4) = '${year}' ORDER BY start_date`,
      )
      .all()
    try {
      incidentRows = db
        .prepare(
          `SELECT i.event_id, i.type, i.subtype, i.minute, i.player_name, i.is_home
             FROM incidents i JOIN matches m ON m.event_id = i.event_id
            WHERE substr(m.season_year, 1, 4) = '${year}' ORDER BY i.minute`,
        )
        .all()
    } catch {
      // No incidents table: matches only
    }
  } finally {
    db.close()
  }
  const incidentsOf = new Map<string, Incident[]>()
  for (const r of incidentRows) {
    const kind = incidentKind(String(r.type ?? ''), String(r.subtype ?? ''))
    if (!kind || r.minute == null) continue
    const id = String(r.event_id)
    if (!incidentsOf.has(id)) incidentsOf.set(id, [])
    incidentsOf.get(id)!.push({
      minute: Number(r.minute),
      side: Number(r.is_home) ? 'home' : 'away',
      kind,
      player: r.player_name ? String(r.player_name) : undefined,
    })
  }
  const extrasByMatch = new Map<string, Pick<RealEvent, 'incidents' | 'ht' | 'spectators'>>()
  const extrasList: SeasonData['extrasList'] = []
  const leagues: Record<string, RealEvent[]> = {}
  const tournaments = new Set<string>()
  const cups: ExternalGame[] = []
  for (const r of rows) {
    const tournament = String(r.tournament_name ?? '')
    tournaments.add(tournament)
    const division = DIVISION_TOURNAMENTS.find(([, re]) => re.test(tournament))?.[0]
    const state = STATE[String(r.status ?? '').toLowerCase()] ?? 'upcoming'
    const score = (v: unknown) => (v === null || v === undefined || v === '' ? undefined : Number(v))
    const incidents = incidentsOf.get(String(r.event_id))
    const kickoff = new Date(String(r.start_date)).toISOString()
    if (!division) {
      // The cup (its name changes with the sponsor)
      const league = { id: 'db', name: tournament, country: 'Denmark' }
      if (cupOfGame({ sport: 'soccer', league })) {
        const finished = state === 'finished' || state === 'live'
        cups.push({
          id: `db-${r.event_id}`,
          sport: 'soccer',
          league,
          home: { name: String(r.home_name) },
          away: { name: String(r.away_name) },
          kickoff,
          state,
          homeScore: finished ? score(r.home_score) : undefined,
          awayScore: finished ? score(r.away_score) : undefined,
          round: Number(r.round) ? `Round ${Number(r.round)}` : undefined,
          ht: state === 'finished' && score(r.home_score_ht) !== undefined && score(r.away_score_ht) !== undefined ? [score(r.home_score_ht)!, score(r.away_score_ht)!] : undefined,
          incidents,
        })
      }
      continue
    }
    ;(leagues[division] ??= []).push({
      id: `db-${r.event_id}`,
      round: Number(r.round) || 0,
      home: String(r.home_name),
      away: String(r.away_name),
      kickoff,
      homeScore: state === 'upcoming' ? undefined : score(r.home_score),
      awayScore: state === 'upcoming' ? undefined : score(r.away_score),
      state,
      incidents,
      ht: state === 'finished' && score(r.home_score_ht) !== undefined && score(r.away_score_ht) !== undefined ? [score(r.home_score_ht)!, score(r.away_score_ht)!] : undefined,
      spectators: score(r.spectators) || undefined,
    })
    const added = leagues[division].at(-1)!
    if (state === 'finished') {
      const extras = { incidents: added.incidents, ht: added.ht, spectators: added.spectators }
      extrasByMatch.set(matchKey(kickoff, String(r.home_name), String(r.away_name)), extras)
      extrasList.push({ kickoff, home: String(r.home_name), away: String(r.away_name), extras })
    }
  }
  historyHolder.__scorelineSeason = { mtime: d.mtime, key: `${d.mtime}`, leagues, cups, tournaments: [...tournaments].sort(), extrasByMatch, extrasList }
  return historyHolder.__scorelineSeason
}

// ---------------------------------------------------------------- a league's past seasons

export interface LeagueSeason {
  season: string
  matches: number
  teams: number
  goalsPerMatch: number
  /** Fewer matches than a full double round: the top three are left out */
  incomplete: boolean
  /** The top three by points over all the season's matches in the database */
  top: { name: string; slug?: string; points: number; played: number }[]
}
export interface LeagueHistory {
  seasons: LeagueSeason[]
  /** Points over every season in the database */
  allTime: { name: string; slug?: string; seasons: number; played: number; points: number; goalsFor: number; goalsAgainst: number }[]
  biggestWin?: PastMatch
  bestCrowd?: PastMatch & { spectators: number }
  matches: number
}

const leagueHistoryCache = new Map<string, { mtime: number; history?: LeagueHistory }>()

/** A Danish division's finished seasons in the database: top three, all-time table and records */
/**
 * A season's league matches as the table counts them. Danish leagues play a
 * regular season (everyone twice) and then split: the top six play for the
 * title or promotion, the rest against relegation, with the points carried
 * over. Play-offs (for a European place, or against another division's teams)
 * are not in the table. Older formats (three rounds, no split) count as they are.
 * Returns the counted matches and, for a split season, the upper group.
 */
function leagueMatchesOf<M extends { date: Date; homeScore: number; awayScore: number }>(
  all: M[],
  keyOf: (m: M, side: 'home' | 'away') => string,
): { counted: M[]; upper?: Set<string> } {
  const sorted = [...all].sort((a, b) => a.date.getTime() - b.date.getTime())
  // The league's own teams: those with a season's worth of matches (a play-off opponent from another division has one or two)
  const games = new Map<string, number>()
  for (const m of sorted) for (const side of ['home', 'away'] as const) games.set(keyOf(m, side), (games.get(keyOf(m, side)) ?? 0) + 1)
  const most = Math.max(0, ...games.values())
  const core = new Set([...games].filter(([, n]) => n >= most / 2).map(([k]) => k))
  const league = sorted.filter((m) => core.has(keyOf(m, 'home')) && core.has(keyOf(m, 'away')))
  const n = core.size
  if (n < 6 || league.length <= n * (n - 1)) return { counted: league }
  // The regular season: each pair's first two meetings (a postponed match played late still belongs to it)
  const met = new Map<string, number>()
  const regularGames: M[] = []
  const after: M[] = []
  for (const m of league) {
    const pair = [keyOf(m, 'home'), keyOf(m, 'away')].sort().join('|')
    const times = (met.get(pair) ?? 0) + 1
    met.set(pair, times)
    ;(times <= 2 ? regularGames : after).push(m)
  }
  // The table after the regular season
  const points = new Map<string, { p: number; gd: number; gf: number }>()
  for (const m of regularGames) {
    for (const side of ['home', 'away'] as const) {
      const [f, a] = side === 'home' ? [m.homeScore, m.awayScore] : [m.awayScore, m.homeScore]
      const r = points.get(keyOf(m, side)) ?? points.set(keyOf(m, side), { p: 0, gd: 0, gf: 0 }).get(keyOf(m, side))!
      r.p += f > a ? 3 : f === a ? 1 : 0
      r.gd += f - a
      r.gf += f
    }
  }
  const order = [...points.entries()].sort(([, x], [, y]) => y.p - x.p || y.gd - x.gd || y.gf - x.gf).map(([k]) => k)
  const upper = new Set(order.slice(0, 6))
  const across = after.filter((m) => upper.has(keyOf(m, 'home')) !== upper.has(keyOf(m, 'away')))
  // Mostly across the halves: a third round for everyone, not a split
  if (across.length > after.length / 4) return { counted: league }
  const acrossSet = new Set(across)
  return { counted: league.filter((m) => !acrossSet.has(m)), upper }
}

export function leagueHistory(divisionId: string): LeagueHistory | undefined {
  const pattern = DIVISION_TOURNAMENTS.find(([id]) => id === divisionId)?.[1]
  const d = data()
  if (!pattern || !d) return undefined
  const hit = leagueHistoryCache.get(divisionId)
  if (hit && hit.mtime === d.mtime) return hit.history
  const current = SEASON.slice(0, 4)
  // football.db's matches by the tournament's name; the statistics bank's only when saved under this league (another sport's or country's "Superliga" is not ours)
  const own = d.matches.filter(
    (m) =>
      (m.divisionId ? m.divisionId === divisionId : pattern.test(m.tournament)) &&
      !/kvinde|women|pokal|cup|u\s?\d{2}/i.test(m.tournament) &&
      !m.season.startsWith(current),
  )
  // Clubs playing in a higher division the same season: their team in this one is a reserve side ("FC København II"), not the club
  const rank = DIVISION_TOURNAMENTS.findIndex(([id]) => id === divisionId)
  const higher = new Map<string, Set<string>>()
  for (const m of d.matches) {
    if (/kvinde|women|pokal|cup|u\s?\d{2}/i.test(m.tournament)) continue
    const r = DIVISION_TOURNAMENTS.findIndex(([id, re]) => (m.divisionId ? m.divisionId === id : re.test(m.tournament)))
    if (r < 0 || r >= rank) continue
    const set = higher.get(m.season) ?? higher.set(m.season, new Set()).get(m.season)!
    for (const id of [m.homeId, m.awayId]) {
      const club = d.clubOf.get(id)
      if (club) set.add(club.id)
    }
  }
  let history: LeagueHistory | undefined
  if (own.length) {
    let season = ''
    const reserve = (id: number) => {
      const club = d.clubOf.get(id)
      return !!club && !!higher.get(season)?.has(club.id)
    }
    const nameOf = (id: number, fallback: string) => {
      const club = d.clubOf.get(id)
      if (!club) return fallback
      if (!reserve(id)) return club.name
      // The source's own name, marked as the second team when it is written like the club's
      return /\b(ii|2|b|u\s?\d{2})$/i.test(fallback.trim()) ? fallback : `${club.name} II`
    }
    const keyOf = (id: number, name: string) => (reserve(id) ? `${id}|${name}|ii` : (d.clubOf.get(id)?.id ?? `${id}|${name}`))
    type Row = { name: string; slug?: string; played: number; points: number; goalsFor: number; goalsAgainst: number; seasons: Set<string> }
    const allTime = new Map<string, Row>()
    const bySeason = new Map<string, DbMatch[]>()
    for (const m of own) bySeason.set(m.season, [...(bySeason.get(m.season) ?? []), m])
    const seasons: LeagueSeason[] = []
    for (const [thisSeason, all] of bySeason) {
      season = thisSeason
      const { counted: list, upper } = leagueMatchesOf(all, (m, side) => (side === 'home' ? keyOf(m.homeId, m.homeName) : keyOf(m.awayId, m.awayName)))
      const table = new Map<string, Row>()
      const add = (map: Map<string, Row>, id: number, name: string, f: number, a: number) => {
        const key = keyOf(id, name)
        const club = d.clubOf.get(id)
        const r = map.get(key) ?? map.set(key, { name: nameOf(id, name), slug: reserve(id) ? undefined : club?.slug, played: 0, points: 0, goalsFor: 0, goalsAgainst: 0, seasons: new Set() }).get(key)!
        r.played++
        r.goalsFor += f
        r.goalsAgainst += a
        r.points += f > a ? 3 : f === a ? 1 : 0
        r.seasons.add(season)
      }
      let goals = 0
      for (const m of list) {
        goals += m.homeScore + m.awayScore
        add(table, m.homeId, m.homeName, m.homeScore, m.awayScore)
        add(table, m.awayId, m.awayName, m.awayScore, m.homeScore)
        add(allTime, m.homeId, m.homeName, m.homeScore, m.awayScore)
        add(allTime, m.awayId, m.awayName, m.awayScore, m.homeScore)
      }
      // The championship (or promotion) group first: a team from the relegation group can't finish above it, whatever its points
      const byPoints = (x: Row, y: Row) => y.points - x.points || y.goalsFor - y.goalsAgainst - (x.goalsFor - x.goalsAgainst) || y.goalsFor - x.goalsFor
      const keyed = [...table.entries()]
      const ranked = upper
        ? [...keyed.filter(([k]) => upper.has(k)).map(([, r]) => r).sort(byPoints), ...keyed.filter(([k]) => !upper.has(k)).map(([, r]) => r).sort(byPoints)]
        : keyed.map(([, r]) => r).sort(byPoints)
      seasons.push({
        season,
        matches: list.length,
        teams: table.size,
        goalsPerMatch: goals / list.length,
        incomplete: list.length < table.size * (table.size - 1),
        top: ranked.slice(0, 3).map((r) => ({ name: r.name, slug: r.slug, points: r.points, played: r.played })),
      })
    }
    seasons.sort((a, b) => b.season.localeCompare(a.season))
    const past = (m: DbMatch): PastMatch => ({
      date: m.date,
      competition: m.tournament,
      home: nameOf(m.homeId, m.homeName),
      away: nameOf(m.awayId, m.awayName),
      homeScore: m.homeScore,
      awayScore: m.awayScore,
    })
    const biggest = own.reduce<DbMatch | undefined>((best, m) => {
      const margin = Math.abs(m.homeScore - m.awayScore)
      const bestMargin = best ? Math.abs(best.homeScore - best.awayScore) : -1
      return margin > bestMargin || (margin === bestMargin && best && m.homeScore + m.awayScore > best.homeScore + best.awayScore) ? m : best
    }, undefined)
    const crowd = own.reduce<DbMatch | undefined>((best, m) => ((m.spectators ?? 0) > (best?.spectators ?? 0) ? m : best), undefined)
    history = {
      seasons,
      allTime: [...allTime.values()]
        .map(({ seasons: s, ...r }) => ({ ...r, seasons: s.size }))
        .sort((a, b) => b.points - a.points)
        .slice(0, 15),
      biggestWin: biggest && past(biggest),
      bestCrowd: crowd?.spectators ? { ...past(crowd), spectators: crowd.spectators } : undefined,
      matches: own.length,
    }
  }
  leagueHistoryCache.set(divisionId, { mtime: d.mtime, history })
  return history
}

// ---------------------------------------------------------------- API-Sports games from our statistics bank

/**
 * Latest results, the table and past meetings for an API-Sports game, from
 * the games our statistics bank has saved in the same league (the free plan
 * can't look these up). Thin at first, it grows with every match day.
 */
export function archiveGameExtras(game: ExternalGame): { form?: MatchExtra['form']; table?: MatchExtra['table']; h2h: PastMatch[] } {
  const api = game.id.split('-')[0]
  const league = `ext-${api}-${game.league.id}`
  const before = Date.parse(game.kickoff)
  const all = readArchive().filter((a) => a.date.getTime() < before)
  const same = (a: string, b: string) => normalize(a) === normalize(b)
  // This season: the league's games after the last break of more than 45 days
  const inLeague = all.filter((a) => a.divisionId === league).sort((x, y) => x.date.getTime() - y.date.getTime())
  let start = 0
  for (let i = 1; i < inLeague.length; i++) if (inLeague[i].date.getTime() - inLeague[i - 1].date.getTime() > 45 * 86_400_000) start = i
  const season = inLeague.slice(start)

  const formOf = (team: string): FormGame[] =>
    all
      .filter((a) => a.id.startsWith(`${api}-`) && (same(a.homeName, team) || same(a.awayName, team)))
      .slice(0, 5)
      .map((a) => {
        const home = same(a.homeName, team)
        return { date: a.date.toISOString(), opponent: home ? a.awayName : a.homeName, home, for: home ? a.homeScore : a.awayScore, against: home ? a.awayScore : a.homeScore, competition: a.tournament }
      })
  const form = { home: formOf(game.home.name), away: formOf(game.away.name) }

  const rows = new Map<string, TableRow>()
  const add = (name: string, f: number, a: number) => {
    const r = rows.get(normalize(name)) ?? rows.set(normalize(name), { rank: 0, name, played: 0, won: 0, drawn: 0, lost: 0, for: 0, against: 0, points: 0 }).get(normalize(name))!
    r.played++
    r.for = (r.for ?? 0) + f
    r.against = (r.against ?? 0) + a
    if (f > a) r.won++
    else if (f < a) r.lost++
    else r.drawn = (r.drawn ?? 0) + 1
    r.points = (r.points ?? 0) + (f > a ? 3 : f === a ? 1 : 0)
  }
  for (const a of season) {
    add(a.homeName, a.homeScore, a.awayScore)
    add(a.awayName, a.awayScore, a.homeScore)
  }
  const table = [...rows.values()]
    .sort((x, y) => (y.points ?? 0) - (x.points ?? 0) || (y.for ?? 0) - (y.against ?? 0) - ((x.for ?? 0) - (x.against ?? 0)) || (y.for ?? 0) - (x.for ?? 0))
    .map((r, i) => ({ ...r, rank: i + 1 }))
  // Points only mean something where draws exist; basketball tables rank on wins
  const noDraws = table.every((r) => !r.drawn)
  const shownTable = noDraws ? table.map(({ drawn: _drawn, points: _points, ...r }) => r) : table

  const h2h = all
    .filter((a) => (same(a.homeName, game.home.name) && same(a.awayName, game.away.name)) || (same(a.homeName, game.away.name) && same(a.awayName, game.home.name)))
    .slice(0, 5)
    .map((a) => ({ date: a.date, competition: a.tournament, home: a.homeName, away: a.awayName, homeScore: a.homeScore, awayScore: a.awayScore }))

  return {
    form: form.home.length || form.away.length ? form : undefined,
    table: table.length >= 4 ? { rows: shownTable } : undefined,
    h2h,
  }
}

/**
 * A league's table this season from the games our statistics bank has saved
 * (after the league's last break of more than 45 days), with how many games
 * it rests on and from when. For API-Sports' leagues, whose tables the free
 * plan doesn't give.
 */
/** A league's matches this season in the statistics bank: from the first match after the last break of more than 45 days */
/**
 * A league's saved matches, oldest first: under one id, or several when the
 * source lists the league under more than one ("A-Liga" and "Kvindeliga").
 * The same match under two of them counts once.
 */
function leagueGames(divisionId: string | string[]): ArchivedMatch[] {
  const ids = new Set(Array.isArray(divisionId) ? divisionId : [divisionId])
  const seen = new Set<string>()
  return readArchive()
    .filter((a) => ids.has(a.divisionId))
    .filter((a) => {
      if (ids.size === 1) return true
      const key = `${isoDate(a.date)}|${normalize(a.homeName)}|${normalize(a.awayName)}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((x, y) => x.date.getTime() - y.date.getTime())
}

export function archiveSeasonGames(divisionId: string | string[]): ArchivedMatch[] {
  const inLeague = leagueGames(divisionId)
  let start = 0
  for (let i = 1; i < inLeague.length; i++) if (inLeague[i].date.getTime() - inLeague[i - 1].date.getTime() > 45 * 86_400_000) start = i
  return inLeague.slice(start)
}

export function archiveLeagueTable(
  divisionId: string | string[],
  baseline?: Baseline,
): { rows: TableRow[]; matches: number; since?: Date; recent: PastMatch[] } {
  const inLeague = leagueGames(divisionId)
  let start = 0
  for (let i = 1; i < inLeague.length; i++) if (inLeague[i].date.getTime() - inLeague[i - 1].date.getTime() > 45 * 86_400_000) start = i
  // With a starting table, only the matches after it count on top of it
  const season = baseline ? inLeague.filter((a) => a.date.getTime() > Date.parse(baseline.after)) : inLeague.slice(start)
  const rows = new Map<string, TableRow>()
  const aliases = new Map<string, string[]>()
  for (const b of baseline?.rows ?? []) {
    const { aliases: other, ...r } = b
    rows.set(normalize(b.name), { rank: 0, ...r })
    aliases.set(normalize(b.name), [b.name, ...(other ?? [])])
  }
  // A team from the data source, matched to the starting table's row ("Brondby W" to "Brøndby IF")
  const women = (n: string) => n.replace(/\b(w|women|kvinder|dame|damer|q)\b\.?/gi, '').trim()
  const keyOf = (name: string) => {
    const key = normalize(name)
    if (rows.has(key) || !aliases.size) return key
    // The same name without "W"/"Q" first ("ASA Aarhus W" is "ASA Aarhus", not also "AGF Aarhus")
    const plain = normalize(women(name))
    const exact = [...aliases.entries()].find(([, names]) => names.some((n) => normalize(women(n)) === plain))
    if (exact) return exact[0]
    const found = [...aliases.entries()].filter(([, names]) => alike(names.map(women), women(name)))
    return found.length === 1 ? found[0][0] : key
  }
  const add = (name: string, f: number, a: number) => {
    const key = keyOf(name)
    const r = rows.get(key) ?? rows.set(key, { rank: 0, name, played: 0, won: 0, drawn: 0, lost: 0, for: 0, against: 0, points: 0 }).get(key)!
    r.played++
    r.for = (r.for ?? 0) + f
    r.against = (r.against ?? 0) + a
    if (f > a) r.won++
    else if (f < a) r.lost++
    else r.drawn = (r.drawn ?? 0) + 1
    r.points = (r.points ?? 0) + (f > a ? 3 : f === a ? 1 : 0)
  }
  for (const a of season) {
    add(a.homeName, a.homeScore, a.awayScore)
    add(a.awayName, a.awayScore, a.homeScore)
  }
  let table = [...rows.values()].sort(
    (x, y) => (y.points ?? 0) - (x.points ?? 0) || (y.for ?? 0) - (y.against ?? 0) - ((x.for ?? 0) - (x.against ?? 0)) || (y.for ?? 0) - (x.for ?? 0),
  )
  // Without draws (basketball, volleyball) the table ranks on wins and shows no points
  if (table.every((r) => !r.drawn)) table = table.map(({ drawn: _d, points: _p, ...r }) => r)
  return {
    rows: table.map((r, i) => ({ ...r, rank: i + 1 })),
    matches: season.length,
    since: season[0]?.date,
    recent: season
      .slice(-10)
      .reverse()
      .map((a) => ({ date: a.date, competition: a.tournament, home: a.homeName, away: a.awayName, homeScore: a.homeScore, awayScore: a.awayScore })),
  }
}

// ---------------------------------------------------------------- older matches' own pages

/** A played match from the match database or the statistics bank, with a page of its own (/kamp/<slug>) */
export interface PastGame {
  slug: string
  sport: SportId
  date: Date
  tournament: string
  season: string
  divisionId?: string
  /** Our club names where the team is one of ours */
  home: string
  away: string
  homeScore: number
  awayScore: number
  spectators?: number
  /** Where its goals and cards are */
  source: { db?: number; archive?: string }
}


function pastIndex() {
  const d = data()
  if (!d) return undefined
  if (historyHolder.__scorelinePast?.loaded === d) return historyHolder.__scorelinePast
  const bySlug = new Map<string, PastGame>()
  for (const m of d.matches) {
    const home = nameOf(d, m.homeId, m.homeName)
    const away = nameOf(d, m.awayId, m.awayName)
    const slug = matchSlug(home, away, isoDate(m.date))
    // The same match twice (both sources): the first, football.db's, wins
    if (bySlug.has(slug) || !home || !away) continue
    bySlug.set(slug, {
      slug,
      sport: m.sport,
      date: m.date,
      tournament: m.tournament,
      season: m.season,
      divisionId: m.divisionId,
      home,
      away,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      spectators: m.spectators,
      source: m.eventId ? { archive: m.eventId } : { db: m.id },
    })
  }
  historyHolder.__scorelinePast = { loaded: d, bySlug, list: [...bySlug.values()] }
  return historyHolder.__scorelinePast
}

/** Every played match we know of, newest first */
export const pastGames = (): PastGame[] => pastIndex()?.list ?? []

export const pastGame = (slug: string): PastGame | undefined => pastIndex()?.bySlug.get(slug)

/** A past match's goals and cards, from the source it came from */
export function pastGameIncidents(g: PastGame): Incident[] {
  if (g.source.archive) {
    return archiveIncidents([g.source.archive]).get(g.source.archive) ?? []
  }
  const sqlite = process.getBuiltinModule?.('node:sqlite') as { DatabaseSync: new (f: string, o: { readOnly: boolean }) => { prepare(sql: string): { all(...p: unknown[]): Row[] }; close(): void } } | undefined
  if (!sqlite || g.source.db === undefined || !existsSync(historyFile())) return []
  const db = new sqlite.DatabaseSync(historyFile(), { readOnly: true })
  try {
    return db
      .prepare('SELECT type, subtype, minute, player_name, is_home FROM incidents WHERE event_id = ? ORDER BY minute')
      .all(g.source.db)
      .flatMap((r): Incident[] => {
        const kind = incidentKind(String(r.type ?? ''), String(r.subtype ?? ''))
        if (!kind || r.minute == null) return []
        return [{ minute: Number(r.minute), side: Number(r.is_home) ? 'home' : 'away', kind, player: r.player_name ? String(r.player_name) : undefined }]
      })
  } catch {
    return []
  } finally {
    db.close()
  }
}

/** Earlier meetings of the two teams (any tournament), newest first */
export function pastMeetings(g: PastGame, count = 5): PastMatch[] {
  const pair = new Set([g.home, g.away])
  const out: PastMatch[] = []
  for (const m of pastGames()) {
    if (m.date >= g.date || m.sport !== g.sport || !pair.has(m.home) || !pair.has(m.away) || m.home === m.away) continue
    out.push({ date: m.date, competition: m.tournament, home: m.home, away: m.away, homeScore: m.homeScore, awayScore: m.awayScore })
    if (out.length >= count) break
  }
  return out
}

/** Earlier meetings with the address of their own match page, where one exists (links between match pages) */
export function withMatchLinks(list: PastMatch[]): PastMatch[] {
  return list.map((m) => {
    if (m.slug) return m
    const slug = matchSlug(m.home, m.away, isoDate(m.date))
    return pastGame(slug) ? { ...m, slug } : m
  })
}

/** The page of the league a past match belongs to, when it is one of ours */
export function pastLeagueSlug(g: PastGame): string | undefined {
  const id = g.divisionId || DIVISION_TOURNAMENTS.find(([, re]) => re.test(g.tournament))?.[0]
  return DIVISIONS.find((d) => d.id === id)?.slug
}

// ---------------------------------------------------------------- which older matches search engines get

/** The leagues whose older matches people search for (by our division ids) */
const TOP_LEAGUES = new Set(['superliga', '1div', 'premierleague', 'bundesliga', 'laliga'])
const TOP_TOURNAMENT = /champions league/i

// football.db's matches with named scorers, found once an hour
let dbDetailed: { at: number; ids: Set<number> } | undefined
function dbDetailedIds(): Set<number> {
  if (dbDetailed && Date.now() - dbDetailed.at < 3_600_000) return dbDetailed.ids
  const ids = new Set<number>()
  const sqlite = process.getBuiltinModule?.('node:sqlite') as { DatabaseSync: new (f: string, o: { readOnly: boolean }) => { prepare(sql: string): { all(...p: unknown[]): Row[] }; close(): void } } | undefined
  if (sqlite && existsSync(historyFile())) {
    let db: { prepare(sql: string): { all(...p: unknown[]): Row[] }; close(): void } | undefined
    try {
      db = new sqlite.DatabaseSync(historyFile(), { readOnly: true })
      for (const r of db.prepare("SELECT DISTINCT event_id FROM incidents WHERE player_name IS NOT NULL AND player_name != ''").all()) ids.add(Number(r.event_id))
    } catch {
      // No incidents table
    } finally {
      db?.close()
    }
  }
  dbDetailed = { at: Date.now(), ids }
  return ids
}

/**
 * Whether an older match's page (one the season's data no longer has) is for
 * search engines: only a match in one of the big leagues or the Champions
 * League that has named scorers or players' numbers. The rest keep their page
 * (links, visitors) but get noindex and stay out of the sitemap, so search
 * engines spend their time on the pages that can rank.
 */
export function pastGameIndexable(g: PastGame): boolean {
  const top = TOP_LEAGUES.has(g.divisionId || DIVISION_TOURNAMENTS.find(([, re]) => re.test(g.tournament))?.[0] || '') || TOP_TOURNAMENT.test(g.tournament)
  if (!top) return false
  return g.source.archive ? archiveDetailedEvents().has(g.source.archive) : g.source.db !== undefined && dbDetailedIds().has(g.source.db)
}

// ---------------------------------------------------------------- earlier seasons' own pages

export interface SeasonTableRow {
  rank: number
  name: string
  slug?: string
  /** The logo from the official table (teams no longer in the league have no other) */
  logo?: string
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  points: number
}

export interface SeasonGame {
  id: string
  date: Date
  home: string
  away: string
  homeScore: number
  awayScore: number
  spectators?: number
  /** Its page, when it has one */
  slug?: string
  /** The source's round ("Regular Season - 7", "Europe Play-off") */
  round?: string
  homeLogo?: string
  awayLogo?: string
}

export interface PastSeason {
  divisionId: string
  /** As saved: "2019/2020", or "2019" for calendar-year leagues */
  season: string
  /** In the address: "2019-2020" */
  slug: string
  /** Shown: "2019/20" */
  label: string
  games: SeasonGame[]
  table: SeasonTableRow[]
  /** Split season: how many teams played in the championship group (ranked first whatever their points) */
  upper?: number
  hasDraws: boolean
  /** Points deducted (negative) or added by the league, from the official table */
  adjustments: { name: string; points: number }[]
  /** The official top scorers, when fetched */
  scorers?: HistoryScorer[]
}

const seasonSlug = (season: string) => season.replace('/', '-')
export const seasonLabel = (season: string) => {
  const m = /^(\d{4})\/(\d{2})(\d{2})$/.exec(season)
  return m ? `${m[1]}/${m[3]}` : season
}

const pastSeasonsCache = new Map<string, { rows: ArchivedMatch[]; tables: string; seasons: PastSeason[] }>()

/**
 * A league's earlier seasons with a page of their own, newest first: only
 * seasons whose saved matches (API-Sports') agree with the league's official
 * final table, team by team (src/lib/seasonCheck.ts). The table is the
 * official one (its order and points, deductions included).
 */
export function pastSeasons(divisionId: string): PastSeason[] {
  const division = DIVISIONS.find((d) => d.id === divisionId)
  if (!division) return []
  const rowsAll = readArchive()
  const sport = sportOf(division)
  const current = [seasonOf(division), SEASON].map((s) => {
    const m = /^(\d{4})\/(\d{2})$/.exec(s)
    return m ? `${m[1]}/${m[1].slice(0, 2)}${m[2]}` : s
  })
  // Only API-Sports' seasons get pages (indexed once per read of the bank in seasonCheck.ts)
  const labels = savedSeasons(divisionId).filter((s) => !current.includes(s))
  const officials = labels.map((l) => historyOfficial(divisionId, l))
  const tablesKey = officials.map((o) => o?.fetchedAt ?? 0).join('|')
  const hit = pastSeasonsCache.get(divisionId)
  if (hit && hit.rows === rowsAll && hit.tables === tablesKey) return hit.seasons
  const find = resolver(sport)
  const shown = (name: string) => find(name)?.name ?? name
  const seasons: PastSeason[] = []
  labels.forEach((season, i) => {
    const check = checkSeason(divisionId, season, sport, officials[i]?.groups)
    if (check.status !== 'ok') return
    // Our numbers per team (they agree with the official ones) in the official order and points
    const mine = new Map<string, { won: number; drawn: number; lost: number; gf: number; ga: number; played: number }>()
    for (const g of check.games) {
      for (const [name, f, a] of [[g.homeName, g.homeScore, g.awayScore], [g.awayName, g.awayScore, g.homeScore]] as const) {
        const r = mine.get(name) ?? mine.set(name, { won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, played: 0 }).get(name)!
        r.played++
        r.gf += f
        r.ga += a
        if (f > a) r.won++
        else if (f < a) r.lost++
        else r.drawn++
      }
    }
    const table = check.table.map((o): SeasonTableRow => {
      const r = mine.get(o.name) ?? { won: o.won, drawn: o.drawn, lost: o.lost, gf: o.goalsFor ?? 0, ga: o.goalsAgainst ?? 0, played: o.played }
      return {
        rank: o.rank,
        name: shown(o.name),
        slug: find(o.name)?.slug,
        logo: realLogo(o.logo),
        played: o.played,
        won: r.won,
        drawn: r.drawn,
        lost: r.lost,
        goalsFor: o.goalsFor ?? r.gf,
        goalsAgainst: o.goalsAgainst ?? r.ga,
        points: o.points ?? r.won * 3 + r.drawn,
      }
    })
    // Every saved match of the season (play-offs too), for the list and the links
    // The teams' logos from the official table, for the match list too
    const logos = new Map(check.table.map((o) => [o.name, realLogo(o.logo)]))
    const games = [...allSeasonGames(divisionId, season)]
      .sort((x, y) => x.date.getTime() - y.date.getTime())
      .map((a): SeasonGame => {
        const home = shown(a.homeName)
        const away = shown(a.awayName)
        const slug = matchSlug(home, away, isoDate(a.date))
        return { id: a.id, date: a.date, home, away, homeScore: a.homeScore, awayScore: a.awayScore, spectators: a.spectators, slug: pastGame(slug) ? slug : undefined, round: a.round, homeLogo: logos.get(a.homeName), awayLogo: logos.get(a.awayName) }
      })
    seasons.push({
      divisionId,
      season,
      slug: seasonSlug(season),
      label: seasonLabel(season),
      games,
      table,
      upper: check.upper,
      hasDraws: sport === 'soccer',
      adjustments: check.adjustments.map((x) => ({ name: shown(x.name), points: x.points })),
      scorers: officials[i]?.scorers?.map((x) => ({ ...x, team: shown(x.team) })),
    })
  })
  seasons.sort((a, b) => b.season.localeCompare(a.season))
  pastSeasonsCache.set(divisionId, { rows: rowsAll, tables: tablesKey, seasons })
  return seasons
}

export const pastSeason = (divisionId: string, slug: string) => pastSeasons(divisionId).find((s) => s.slug === slug)

/** A past season's match as a row for the match lists (MatchRow) */
export function seasonGameAsMatch(g: SeasonGame, division: { id: string; name: string; slug: string; sport?: SportId }): Match {
  return {
    id: g.id,
    slug: g.slug ?? '',
    sport: division.sport ?? 'soccer',
    league: division.name,
    leagueId: division.id,
    leagueSlug: division.slug,
    kickoff: g.date,
    state: 'finished',
    statusLabel: NOT_LEAGUE_ROUND.test(g.round ?? '') ? 'Slutspil' : 'Slut',
    home: { name: g.home, score: g.homeScore, badge: g.homeLogo },
    away: { name: g.away, score: g.awayScore, badge: g.awayLogo },
    real: true,
  }
}
