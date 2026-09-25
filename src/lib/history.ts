import 'server-only'
import { existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { DIVISIONS, sportOf, type Club } from '../data/leagues'
import { SEARCH_NAMES, normalize } from '../data/aliases'
import type { PastMatch } from '../data/matchInsights'
import { cacheDir } from './tsdb'

// Real match history from the downloaded database (SQLite, read-only):
// /opt/scoreline/data/football.db on the VPS, or STATS_DB. It has the
// tables `matches` (one row per match) and `incidents` (goals etc.). Its
// teams are matched to our clubs by name; head-to-head records and club
// history come from here instead of the fictional generator.

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
  for (const d of DIVISIONS) {
    if (d.countryCode !== 'DK' || sportOf(d) !== 'soccer') continue
    for (const club of d.clubs) {
      for (const n of [club.name, club.apiName, SEARCH_NAMES[club.id]]) {
        const key = n && normalize(n)
        if (key && !byName.has(key)) byName.set(key, club)
      }
    }
  }
  return (name: string) => byName.get(normalize(name))
}

function read(file: string, mtime: number): Loaded {
  const sqlite = process.getBuiltinModule?.('node:sqlite') as { DatabaseSync: new (f: string, o: { readOnly: boolean }) => Db } | undefined
  if (!sqlite) throw new Error(`Node ${process.version} kan ikke læse SQLite – kræver Node 22.13 eller nyere`)
  const db = new sqlite.DatabaseSync(file, { readOnly: true })
  let rows: Row[]
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
  const matches: DbMatch[] = rows.map((r) => ({
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
    if (!existsSync(file)) {
      lastError = `Filen ${file} findes ikke`
      loaded = undefined
      return undefined
    }
    const mtime = statSync(file).mtimeMs
    if (!loaded || loaded.mtime !== mtime) loaded = read(file, mtime)
    lastError = undefined
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
  const own = d?.byClub.get(club.id)
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
  const list = [...seasons.values()].map(({ tournamentId, seasonId, dbId, ...s }) => {
    const table = finalTable(d, tournamentId, seasonId)
    // A position only makes sense for league play, where everyone plays everyone
    const league = s.played >= table.length - 1 && table.length >= 6
    return { ...s, teams: table.length, position: league ? table.indexOf(dbId) + 1 : undefined }
  })
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
    unmatched: d?.unmatched ?? [],
  }
}
