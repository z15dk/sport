import 'server-only'
import { existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { DIVISIONS, SEASON, sportOf, type Club } from '../data/leagues'
import type { RealEvent } from '../data/real'
import type { Incident, MatchState } from '../types'
import { SEARCH_NAMES, alike, normalize } from '../data/aliases'
import type { PastMatch } from '../data/matchInsights'
import type { ExternalGame } from '../data/external'
import type { FormGame, MatchExtra, TableRow } from '../data/matchExtra'
import { cacheDir } from './tsdb'
import { archiveFile, readArchive } from './archive'
import { hashString } from '../data/fixtures'

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
}

interface Loaded {
  mtime: number
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

let loaded: Loaded | undefined
let checkedAt = 0
let lastError: string | undefined

function resolver() {
  const byName = new Map<string, Club>()
  // Danish football first (football.db is Danish football), then every other league (the archive has them all)
  const ordered = [...DIVISIONS.filter((d) => d.countryCode === 'DK' && sportOf(d) === 'soccer'), ...DIVISIONS.filter((d) => d.countryCode !== 'DK' || sportOf(d) !== 'soccer')]
  for (const d of ordered) {
    for (const club of d.clubs) {
      for (const n of [club.name, club.originalName, club.apiName, SEARCH_NAMES[club.id]]) {
        const key = n && normalize(n)
        if (key && !byName.has(key)) byName.set(key, club)
      }
    }
  }
  const danish = DIVISIONS.filter((d) => d.countryCode === 'DK' && sportOf(d) === 'soccer').flatMap((d) => d.clubs)
  const everyone = DIVISIONS.flatMap((d) => d.clubs)
  // Each name is looked up once: the loose matching below is too slow to repeat for every match in the database
  const memo = new Map<string, Club | undefined>()
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
    const names = (c: Club) => [c.name, c.originalName, c.apiName, SEARCH_NAMES[c.id]].filter((n): n is string => !!n)
    // Danish football first (football.db), then any of our clubs (past seasons of the other leagues in the statistics bank)
    const loose = danish.filter((c) => alike(names(c), name))
    if (loose.length === 1) return loose[0]
    if (loose.length) return undefined
    const other = everyone.filter((c) => alike(names(c), name))
    return other.length === 1 ? other[0] : undefined
  }
}

function read(file: string | undefined, mtime: number): Loaded {
  const sqlite = process.getBuiltinModule?.('node:sqlite') as { DatabaseSync: new (f: string, o: { readOnly: boolean }) => Db } | undefined
  if (!sqlite) throw new Error(`Node ${process.version} kan ikke læse SQLite – kræver Node 22.13 eller nyere`)
  let rows: Row[] = []
  const db = file ? new sqlite.DatabaseSync(file, { readOnly: true }) : undefined
  if (db) try {
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
  const fromDb: DbMatch[] = rows.map((r) => ({
    id: Number(r.event_id),
    tournamentId: Number(r.tournament_id),
    tournament: String(r.tournament_name ?? ''),
    seasonId: Number(r.season_id),
    season: String(r.season_year ?? ''),
    date: new Date(String(r.start_date)),
    homeId: Number(r.home_id),
    homeName: String(r.home_name ?? ''),
    awayId: Number(r.away_id),
    awayName: String(r.away_name ?? ''),
    homeScore: Number(r.home_score),
    awayScore: Number(r.away_score),
    spectators: r.spectators == null ? undefined : Number(r.spectators),
  }))

  // Our own statistics bank: every other league, and anything football.db no longer has
  const seen = new Set(fromDb.map((m) => matchKey(m.date.toISOString(), m.homeName, m.awayName)))
  const teamId = (name: string) => -hashString(normalize(name))
  const fromArchive: DbMatch[] = readArchive()
    .filter((a) => !seen.has(matchKey(a.date.toISOString(), a.homeName, a.awayName)))
    .map((a) => ({
      id: -hashString(a.id),
      tournamentId: -hashString(a.divisionId),
      tournament: a.tournament,
      seasonId: -hashString(a.season),
      season: a.season,
      date: a.date,
      homeId: teamId(a.homeName),
      homeName: a.homeName,
      awayId: teamId(a.awayName),
      awayName: a.awayName,
      homeScore: a.homeScore,
      awayScore: a.awayScore,
      spectators: a.spectators,
    }))
  const matches = [...fromDb, ...fromArchive].sort((a, b) => b.date.getTime() - a.date.getTime())

  // Newest name per team id (clubs get renamed), then matched to our register
  const names = new Map<number, string>()
  for (const m of matches) {
    if (!names.has(m.homeId)) names.set(m.homeId, m.homeName)
    if (!names.has(m.awayId)) names.set(m.awayId, m.awayName)
  }
  const find = resolver()
  const clubOf = new Map<number, Club>()
  const unmatched: string[] = []
  for (const [id, name] of names) {
    const club = find(name)
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

/** The database in memory; re-read when the file changes (checked at most once a minute) */
function data(): Loaded | undefined {
  const now = Date.now()
  if (loaded && now - checkedAt < 60_000) return loaded
  checkedAt = now
  const file = historyFile()
  try {
    const hasDb = existsSync(file)
    const hasArchive = existsSync(archiveFile())
    if (!hasDb && !hasArchive) {
      lastError = `Filen ${file} findes ikke`
      loaded = undefined
      return undefined
    }
    // Re-read when either football.db or the archive has changed
    const mtime = (hasDb ? statSync(file).mtimeMs : 0) + (hasArchive ? statSync(archiveFile()).mtimeMs / 1000 : 0)
    if (!loaded || loaded.mtime !== mtime) loaded = read(hasDb ? file : undefined, mtime)
    lastError = hasDb ? undefined : `Filen ${file} findes ikke (bruger kun statistikbanken)`
  } catch (err) {
    lastError = (err as Error).message
  }
  return loaded
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
  const own = d?.byClub.get(club.id)?.filter((m) => !m.season.startsWith(current))
  if (!d || !own?.length) return undefined
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
    error: lastError ?? null,
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
  /** The same, as a list (for matching names written differently) */
  extrasList: { kickoff: string; home: string; away: string; extras: Pick<RealEvent, 'incidents' | 'ht' | 'spectators'> }[]
}
let seasonCache: SeasonData | undefined

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
  if (seasonCache?.mtime === d.mtime) return seasonCache
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
  for (const r of rows) {
    const tournament = String(r.tournament_name ?? '')
    tournaments.add(tournament)
    const division = DIVISION_TOURNAMENTS.find(([, re]) => re.test(tournament))?.[0]
    if (!division) continue
    const state = STATE[String(r.status ?? '').toLowerCase()] ?? 'upcoming'
    const score = (v: unknown) => (v === null || v === undefined || v === '' ? undefined : Number(v))
    const incidents = incidentsOf.get(String(r.event_id))
    const kickoff = new Date(String(r.start_date)).toISOString()
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
  seasonCache = { mtime: d.mtime, key: `${d.mtime}`, leagues, tournaments: [...tournaments].sort(), extrasByMatch, extrasList }
  return seasonCache
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
export function leagueHistory(divisionId: string): LeagueHistory | undefined {
  const pattern = DIVISION_TOURNAMENTS.find(([id]) => id === divisionId)?.[1]
  const d = data()
  if (!pattern || !d) return undefined
  const hit = leagueHistoryCache.get(divisionId)
  if (hit && hit.mtime === d.mtime) return hit.history
  const current = SEASON.slice(0, 4)
  const own = d.matches.filter((m) => pattern.test(m.tournament) && !/kvinde|women|pokal|cup|u\s?\d{2}/i.test(m.tournament) && !m.season.startsWith(current))
  let history: LeagueHistory | undefined
  if (own.length) {
    const nameOf = (id: number, fallback: string) => d.clubOf.get(id)?.name ?? fallback
    const keyOf = (id: number, name: string) => d.clubOf.get(id)?.id ?? `${id}|${name}`
    type Row = { name: string; slug?: string; played: number; points: number; goalsFor: number; goalsAgainst: number; seasons: Set<string> }
    const allTime = new Map<string, Row>()
    const bySeason = new Map<string, DbMatch[]>()
    for (const m of own) bySeason.set(m.season, [...(bySeason.get(m.season) ?? []), m])
    const seasons: LeagueSeason[] = []
    for (const [season, list] of bySeason) {
      const table = new Map<string, Row>()
      const add = (map: Map<string, Row>, id: number, name: string, f: number, a: number) => {
        const key = keyOf(id, name)
        const club = d.clubOf.get(id)
        const r = map.get(key) ?? map.set(key, { name: nameOf(id, name), slug: club?.slug, played: 0, points: 0, goalsFor: 0, goalsAgainst: 0, seasons: new Set() }).get(key)!
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
      const ranked = [...table.values()].sort((x, y) => y.points - x.points || y.goalsFor - y.goalsAgainst - (x.goalsFor - x.goalsAgainst) || y.goalsFor - x.goalsFor)
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
