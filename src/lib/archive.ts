import 'server-only'
import { timed } from './slow'
import { role } from './role'
import { workerStatus } from './workerStatus'
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { Worker } from 'node:worker_threads'
import path from 'node:path'
import { DIVISIONS, seasonOf } from '../data/leagues'
import { getRealData, type RealEvent } from '../data/real'
import { cacheDir } from './tsdb'

// Matchly's own statistics bank: every finished match we have seen, from
// any source and any league, with result, half-time score, attendance, goals
// and cards. Kept in SQLite beside football.db (/opt/scoreline/data on the
// VPS, or ARCHIVE_DB), so nothing is lost when a source changes or drops a
// match. The history (club pages, head-to-heads) reads it together with
// football.db.

export const archiveFile = (): string =>
  process.env.ARCHIVE_DB ?? path.join(/*turbopackIgnore: true*/ cacheDir(), 'data', 'scoreline-arkiv.db')

type Row = Record<string, unknown>
interface Stmt {
  run(...params: unknown[]): unknown
  all(...params: unknown[]): Row[]
  get(...params: unknown[]): Row | undefined
}
interface Db {
  exec(sql: string): void
  prepare(sql: string): Stmt
  close(): void
}
type Sqlite = { DatabaseSync: new (file: string, opts?: { readOnly?: boolean }) => Db }
const sqlite = () => process.getBuiltinModule?.('node:sqlite') as Sqlite | undefined

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS matches (
    event_id TEXT PRIMARY KEY,
    source TEXT,
    division_id TEXT,
    tournament_name TEXT,
    season_year TEXT,
    round INTEGER,
    start_date TEXT,
    home_name TEXT,
    away_name TEXT,
    home_score INTEGER,
    away_score INTEGER,
    home_score_ht INTEGER,
    away_score_ht INTEGER,
    spectators INTEGER,
    status TEXT,
    saved_at TEXT
  );
  CREATE TABLE IF NOT EXISTS events_checked (
    event_id TEXT PRIMARY KEY,
    checked_at TEXT
  );
  CREATE TABLE IF NOT EXISTS incidents (
    event_id TEXT,
    minute INTEGER,
    side TEXT,
    kind TEXT,
    player TEXT
  );
  CREATE INDEX IF NOT EXISTS incidents_event ON incidents (event_id);
  CREATE TABLE IF NOT EXISTS player_games (
    event_id TEXT,
    player_id INTEGER,
    name TEXT,
    team_id INTEGER,
    team TEXT,
    side TEXT,
    position TEXT,
    minutes INTEGER,
    rating REAL,
    goals INTEGER,
    assists INTEGER,
    yellow INTEGER,
    red INTEGER,
    shots INTEGER,
    shots_on INTEGER,
    passes INTEGER,
    key_passes INTEGER,
    saves INTEGER,
    conceded INTEGER,
    substitute INTEGER,
    captain INTEGER,
    PRIMARY KEY (event_id, player_id)
  );
  CREATE INDEX IF NOT EXISTS player_games_player ON player_games (player_id);
  CREATE INDEX IF NOT EXISTS player_games_name ON player_games (name);
  CREATE TABLE IF NOT EXISTS players_checked (
    event_id TEXT PRIMARY KEY,
    checked_at TEXT
  );
  CREATE INDEX IF NOT EXISTS matches_date ON matches (start_date);
  CREATE INDEX IF NOT EXISTS matches_saved ON matches (saved_at);
`

/** "2026/27" -> "2026/2027" (the form football.db uses); calendar years stay as they are */
function seasonYear(label: string) {
  const m = /^(\d{4})\/(\d{2})$/.exec(label)
  return m ? `${m[1]}/${m[1].slice(0, 2)}${m[2]}` : label
}

// On globalThis: the job (started from instrumentation) and the status page load separate copies of this module
const holder = globalThis as { __scorelineArchive?: { saved: number; lastRun?: string; lastError?: string } }
const state = (holder.__scorelineArchive ??= { saved: 0 })

/** Saves every finished match in the current data; matches already saved are updated if they changed */
export function archiveFinished() {
  timed('Statistikbanken gemmer kampe', archiveFinishedNow)
}
function archiveFinishedNow() {
  const data = getRealData()
  const lib = sqlite()
  if (!data || !lib) return
  try {
    mkdirSync(path.dirname(archiveFile()), { recursive: true })
    const db = new lib.DatabaseSync(archiveFile())
    try {
      db.exec('PRAGMA busy_timeout = 5000')
      db.exec(SCHEMA)
      const upsert = db.prepare(`
        INSERT INTO matches (event_id, source, division_id, tournament_name, season_year, round, start_date, home_name, away_name,
                             home_score, away_score, home_score_ht, away_score_ht, spectators, status, saved_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'finished', ?)
        ON CONFLICT(event_id) DO UPDATE SET
          home_score = excluded.home_score, away_score = excluded.away_score,
          home_score_ht = excluded.home_score_ht, away_score_ht = excluded.away_score_ht,
          spectators = excluded.spectators, start_date = excluded.start_date, saved_at = excluded.saved_at
        WHERE matches.home_score IS NOT excluded.home_score OR matches.away_score IS NOT excluded.away_score
           OR matches.home_score_ht IS NOT excluded.home_score_ht OR matches.spectators IS NOT excluded.spectators`)
      const incidentCount = db.prepare('SELECT COUNT(*) AS n FROM incidents WHERE event_id = ?')
      const clearIncidents = db.prepare('DELETE FROM incidents WHERE event_id = ?')
      const addIncident = db.prepare('INSERT INTO incidents (event_id, minute, side, kind, player) VALUES (?, ?, ?, ?, ?)')
      const now = new Date().toISOString()
      db.exec('BEGIN')
      for (const [divisionId, events] of Object.entries(data.leagues)) {
        const division = DIVISIONS.find((d) => d.id === divisionId)
        if (!division) continue
        for (const e of events as RealEvent[]) {
          if (e.state !== 'finished' || e.homeScore === undefined || e.awayScore === undefined) continue
          const id = e.id.startsWith('db-') ? e.id : `tsdb-${e.id}`
          upsert.run(
            id,
            e.id.startsWith('db-') ? 'football.db' : 'TheSportsDB',
            division.id,
            division.name,
            seasonYear(seasonOf(division)),
            e.round,
            e.kickoff,
            e.home,
            e.away,
            e.homeScore,
            e.awayScore,
            e.ht?.[0] ?? null,
            e.ht?.[1] ?? null,
            e.spectators ?? null,
            now,
          )
          // Goals and cards: replaced when the source has a different number of them
          const incidents = e.incidents ?? []
          if (incidents.length && Number(incidentCount.get(id)?.n ?? 0) !== incidents.length) {
            clearIncidents.run(id)
            for (const i of incidents) addIncident.run(id, i.minute, i.side, i.kind, i.player ?? null)
          }
        }
      }
      // Games from API-Sports in other leagues
      for (const g of data.external ?? []) {
        if (g.state !== 'finished' || g.homeScore === undefined || g.awayScore === undefined) continue
        const api = g.id.split('-')[0]
        upsert.run(
          g.id,
          `API-Sports ${api}`,
          `ext-${api}-${g.league.id}`,
          g.league.name,
          g.kickoff.slice(0, 4),
          null,
          g.kickoff,
          g.home.name,
          g.away.name,
          g.homeScore,
          g.awayScore,
          g.ht?.[0] ?? null,
          g.ht?.[1] ?? null,
          null,
          now,
        )
        const incidents = g.incidents ?? []
        if (incidents.length && Number(incidentCount.get(g.id)?.n ?? 0) !== incidents.length) {
          clearIncidents.run(g.id)
          for (const i of incidents) addIncident.run(g.id, i.minute, i.side, i.kind, i.player ?? null)
        }
      }
      db.exec('COMMIT')
      state.saved = Number(db.prepare('SELECT COUNT(*) AS n FROM matches').get()?.n ?? 0)
      state.lastRun = now
      state.lastError = undefined
    } catch (err) {
      try {
        db.exec('ROLLBACK')
      } catch {
        // no transaction open
      }
      throw err
    } finally {
      db.close()
    }
  } catch (err) {
    state.lastError = (err as Error).message
  }
}

export interface ArchivedMatch {
  id: string
  divisionId: string
  tournament: string
  season: string
  date: Date
  homeName: string
  awayName: string
  homeScore: number
  awayScore: number
  ht?: [number, number]
  spectators?: number
  /** The source's round ("Regular Season - 7", "Championship Round - 3", "Europe Play-off"), when saved */
  round?: string
}

/**
 * Every archived match, newest first. Kept in memory and read again at most
 * every 5 minutes (the archive grows all the time; pages must not read the
 * whole file on every visit).
 */
interface ArchiveRead {
  at: number
  mtime: number
  rows: ArchivedMatch[]
  byId: Map<string, ArchivedMatch>
  /** The newest saved_at read: later reads only ask for rows saved after it */
  savedAt: string
}
const archiveHolder = globalThis as typeof globalThis & { __scorelineArchiveRead2?: ArchiveRead; __scorelineStrings?: Map<string, string> }

/**
 * The same string once in memory: the archive repeats the leagues', seasons'
 * and teams' names on every match, and SQLite gives a new copy each time.
 */
export function intern(s: string): string {
  const pool = (archiveHolder.__scorelineStrings ??= new Map())
  const have = pool.get(s)
  if (have !== undefined) return have
  pool.set(s, s)
  return s
}

/**
 * Every finished match in the statistics bank, newest first. Read once, then
 * only the rows saved since (the file changes every few minutes); the matches
 * already read stay the same objects.
 */
export function readArchive(): ArchivedMatch[] {
  const cached = archiveHolder.__scorelineArchiveRead2
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.rows
  let mtime = 0
  try {
    mtime = statSync(archiveFile()).mtimeMs
  } catch {
    mtime = 0
  }
  if (cached && cached.mtime === mtime) {
    cached.at = Date.now()
    return cached.rows
  }
  const state: ArchiveRead = cached ?? { at: 0, mtime: 0, rows: [], byId: new Map(), savedAt: '' }
  const fresh = timed('Statistikbanken læses', () => readArchiveFile(state.savedAt))
  mergeArchive(state, fresh, mtime, !!cached)
  return state.rows
}

/** One row of the archive's SELECT as the match we keep (strings interned: the names repeat across thousands of rows) */
function toArchived(r: Record<string, unknown>): { row: ArchivedMatch; savedAt: string } {
  const text = (v: unknown) => intern(String(v ?? ''))
  return {
    savedAt: String(r.saved_at ?? ''),
    row: {
      id: String(r.event_id),
      divisionId: text(r.division_id),
      tournament: text(r.tournament_name),
      season: text(r.season_year),
      date: new Date(String(r.start_date)),
      homeName: text(r.home_name),
      awayName: text(r.away_name),
      homeScore: Number(r.home_score),
      awayScore: Number(r.away_score),
      ht: r.home_score_ht == null || r.away_score_ht == null ? undefined : ([Number(r.home_score_ht), Number(r.away_score_ht)] as [number, number]),
      spectators: r.spectators == null ? undefined : Number(r.spectators),
      round: r.round == null ? undefined : text(r.round),
    },
  }
}

// >= and by id: rows saved in the same millisecond as the last one read are not missed
const READ_SQL = `SELECT event_id, division_id, tournament_name, season_year, round, start_date, home_name, away_name, home_score, away_score, home_score_ht, away_score_ht, spectators, saved_at
           FROM matches WHERE status = 'finished' AND IFNULL(saved_at, '') >= ?`

/** The finished matches saved after `since` (all of them from ''), or undefined when the archive cannot be read */
function readArchiveFile(since: string): { row: ArchivedMatch; savedAt: string }[] | undefined {
  const lib = sqlite()
  if (!lib) return undefined
  let db: Db
  try {
    db = new lib.DatabaseSync(archiveFile(), { readOnly: true })
  } catch {
    return undefined // no archive yet
  }
  try {
    return db.prepare(READ_SQL).all(since).map((r) => toArchived(r as Record<string, unknown>))
  } catch {
    return undefined
  } finally {
    db.close()
  }
}

/** Folds freshly read rows into the cache (the same rows keep their objects, so the history can reuse what it built from them) */
function mergeArchive(state: ArchiveRead, fresh: { row: ArchivedMatch; savedAt: string }[] | undefined, mtime: number, hadCache: boolean) {
  if (fresh) {
    for (const { row, savedAt } of fresh) {
      state.byId.set(row.id, row)
      if (savedAt > state.savedAt) state.savedAt = savedAt
    }
    if (fresh.length || !hadCache) state.rows = [...state.byId.values()].sort((a, b) => b.date.getTime() - a.date.getTime())
  }
  state.at = Date.now()
  state.mtime = mtime
  archiveHolder.__scorelineArchiveRead2 = state
}

// Runs in a worker thread: the first (big) read of the archive, so the site process is not blocked for seconds by it
const READ_THREAD = `
const { parentPort, workerData } = require('node:worker_threads')
const { DatabaseSync } = require('node:sqlite')
const db = new DatabaseSync(workerData.file, { readOnly: true })
try {
  parentPort.postMessage(db.prepare(workerData.sql).all(workerData.since))
} finally {
  db.close()
}
`
let prefetching: Promise<void> | undefined

/**
 * Reads the archive in a worker thread and fills the cache, so the next
 * readArchive() answers at once. The first read takes seconds (every finished
 * match we have); on the main thread that would hold every page. Resolves when
 * done, also when there is no archive or the thread fails (readArchive then
 * reads on the main thread as before).
 */
export function prefetchArchive(): Promise<void> {
  if (prefetching) return prefetching
  const cached = archiveHolder.__scorelineArchiveRead2
  let mtime = 0
  try {
    mtime = statSync(archiveFile()).mtimeMs
  } catch {
    return Promise.resolve()
  }
  if (cached && cached.mtime === mtime) return Promise.resolve()
  const state: ArchiveRead = cached ?? { at: 0, mtime: 0, rows: [], byId: new Map(), savedAt: '' }
  prefetching = new Promise<void>((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      prefetching = undefined
      resolve()
    }
    try {
      const w = new Worker(READ_THREAD, { eval: true, workerData: { file: archiveFile(), sql: READ_SQL, since: state.savedAt } })
      w.unref()
      w.once('message', (rows: Record<string, unknown>[]) => {
        timed('Statistikbanken flettes (fra tråd)', () => mergeArchive(state, rows.map(toArchived), mtime, !!cached))
        finish()
      })
      w.once('error', finish)
      w.once('exit', finish)
    } catch {
      finish()
    }
  })
  return prefetching
}

// The matches with details of their own (named scorers or players' numbers), found once an hour
let detailed: { at: number; ids: Set<string> } | undefined

/** The statistics bank's matches that have named scorers or players' numbers: worth a search engine's time */
export function archiveDetailedEvents(): Set<string> {
  if (detailed && Date.now() - detailed.at < 3_600_000) return detailed.ids
  const ids = new Set<string>()
  const lib = sqlite()
  if (lib && existsFile(archiveFile())) {
    let db: Db | undefined
    try {
      db = new lib.DatabaseSync(archiveFile(), { readOnly: true })
      for (const r of db.prepare("SELECT DISTINCT event_id FROM incidents WHERE player IS NOT NULL AND player != ''").all()) ids.add(String(r.event_id))
      for (const r of db.prepare('SELECT DISTINCT event_id FROM player_games').all()) ids.add(String(r.event_id))
    } catch {
      // An older bank without a table: what was found so far
    } finally {
      db?.close()
    }
  }
  detailed = { at: Date.now(), ids }
  return ids
}

/** Numbers for the status page */
/** The goals and cards the statistics bank has for these matches */
export function archiveIncidents(ids: string[]): Map<string, import('../types').Incident[]> {
  const out = new Map<string, import('../types').Incident[]>()
  const lib = sqlite()
  if (!lib || !ids.length) return out
  let db: Db
  try {
    db = new lib.DatabaseSync(archiveFile(), { readOnly: true })
  } catch {
    return out
  }
  try {
    const wanted = new Set(ids)
    // One query for the lot: the ids are ours (from the archive), in chunks the database accepts
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500)
      const rows = db.prepare(`SELECT event_id, minute, side, kind, player FROM incidents WHERE event_id IN (${chunk.map(() => '?').join(',')}) ORDER BY minute`).all(...chunk)
      for (const r of rows) {
        const id = String(r.event_id)
        if (!wanted.has(id)) continue
        const kind = String(r.kind) as import('../types').Incident['kind']
        if (!['goal', 'penalty', 'own-goal', 'yellow', 'red'].includes(kind)) continue
        if (!out.has(id)) out.set(id, [])
        out.get(id)!.push({ minute: Number(r.minute), side: r.side === 'away' ? 'away' : 'home', kind, player: r.player ? String(r.player) : undefined })
      }
    }
  } catch {
    // an older archive without incidents
  } finally {
    db.close()
  }
  return out
}

/** The saving job's own state (for the split server's status file, src/lib/workerStatus.ts) */
export const archiveJobStatus = () => ({ lastRun: state.lastRun ?? null, lastError: state.lastError ?? null })

type ArchiveCounts = { file: string; total: number; byDivision: { division: string; matches: number; incidents: number }[]; lastRun: string | null; lastError: string | null }
const countHolder = globalThis as typeof globalThis & { __scorelineArchiveStatus?: { at: number; value?: ArchiveCounts; counting?: boolean } }

/**
 * The statistics bank's numbers for /admin/data. Counting a big archive takes
 * a second or more, so it is done in a thread of its own (never blocking the
 * server) at most every ten minutes; until the first count, the matches saved
 * since start.
 */
export function archiveStatus(): ArchiveCounts {
  // A split server: the background process counts, the site process never blocks on it
  if (role() === 'web') {
    const w = workerStatus()?.archive
    if (w && 'total' in w) return w as ArchiveCounts
  }
  const c = (countHolder.__scorelineArchiveStatus ??= { at: 0 })
  if (!c.counting && Date.now() - c.at > 10 * 60_000) countInThread(c)
  return { file: archiveFile(), total: state.saved, byDivision: [], ...c.value, lastRun: state.lastRun ?? null, lastError: state.lastError ?? null }
}

// Runs in a worker thread: node:sqlite there, the counts back as a message
const COUNT_THREAD = `
const { parentPort, workerData } = require('node:worker_threads')
const { DatabaseSync } = require('node:sqlite')
const db = new DatabaseSync(workerData, { readOnly: true })
try {
  const rows = db.prepare(\`SELECT tournament_name AS division, COUNT(*) AS matches,
      SUM((SELECT COUNT(*) FROM incidents i WHERE i.event_id = m.event_id)) AS incidents
      FROM matches m GROUP BY tournament_name ORDER BY matches DESC\`).all()
  parentPort.postMessage(rows.map((r) => ({ division: String(r.division), matches: Number(r.matches), incidents: Number(r.incidents ?? 0) })))
} finally {
  db.close()
}
`
function countInThread(c: NonNullable<typeof countHolder.__scorelineArchiveStatus>) {
  if (!existsSync(archiveFile())) return
  c.counting = true
  c.at = Date.now()
  try {
    const w = new Worker(COUNT_THREAD, { eval: true, workerData: archiveFile() })
    w.unref()
    w.once('message', (byDivision: ArchiveCounts['byDivision']) => {
      c.value = { file: archiveFile(), total: byDivision.reduce((n, r) => n + r.matches, 0), byDivision, lastRun: null, lastError: null }
    })
    w.once('error', () => undefined)
    w.once('exit', () => {
      c.counting = false
    })
  } catch {
    c.counting = false
  }
}

/**
 * Saves a past season of one of our leagues (from API-Sports) in the
 * statistics bank, so club pages get history for leagues football.db does
 * not cover. Returns how many finished matches were saved.
 */
/**
 * Saved API-Sports football matches from past seasons whose goals and cards
 * have not been fetched yet, newest first (for the paid plan's backfill).
 */
export function archiveMissingEvents(limit: number): string[] {
  const lib = sqlite()
  if (!lib) return []
  let db: Db
  try {
    db = new lib.DatabaseSync(archiveFile())
  } catch {
    return []
  }
  try {
    db.exec('PRAGMA busy_timeout = 5000')
    db.exec(SCHEMA)
    return db
      .prepare(
        `SELECT m.event_id FROM matches m
          WHERE m.event_id LIKE 'football-%' AND m.status = 'finished'
            AND NOT EXISTS (SELECT 1 FROM incidents i WHERE i.event_id = m.event_id)
            AND NOT EXISTS (SELECT 1 FROM events_checked c WHERE c.event_id = m.event_id)
          ORDER BY m.start_date DESC LIMIT ?`,
      )
      .all(limit)
      .map((r) => String(r.event_id))
  } catch {
    return []
  } finally {
    db.close()
  }
}

/** Goals and cards for saved matches (and the ones checked that had none) */
export function archiveEvents(found: { id: string; incidents: import('../types').Incident[] }[], checked: string[]) {
  const lib = sqlite()
  if (!lib || (!found.length && !checked.length)) return
  const db = new lib.DatabaseSync(archiveFile())
  try {
    db.exec('PRAGMA busy_timeout = 5000')
    db.exec(SCHEMA)
    const clear = db.prepare('DELETE FROM incidents WHERE event_id = ?')
    const add = db.prepare('INSERT INTO incidents (event_id, minute, side, kind, player) VALUES (?, ?, ?, ?, ?)')
    const mark = db.prepare('INSERT OR REPLACE INTO events_checked (event_id, checked_at) VALUES (?, ?)')
    const now = new Date().toISOString()
    db.exec('BEGIN')
    for (const f of found) {
      clear.run(f.id)
      for (const i of f.incidents) add.run(f.id, i.minute, i.side, i.kind, i.player ?? null)
    }
    for (const id of checked) mark.run(id, now)
    db.exec('COMMIT')
  } finally {
    db.close()
  }
}

export function archiveSeason(divisionId: string, tournament: string, season: string, games: import('../data/external').ExternalGame[]): number {
  const lib = sqlite()
  if (!lib) return 0
  const finished = games.filter((g) => g.state === 'finished' && g.homeScore !== undefined && g.awayScore !== undefined)
  if (!finished.length) return 0
  mkdirSync(path.dirname(archiveFile()), { recursive: true })
  const db = new lib.DatabaseSync(archiveFile())
  try {
    db.exec('PRAGMA busy_timeout = 5000')
    db.exec(SCHEMA)
    const upsert = db.prepare(`
      INSERT INTO matches (event_id, source, division_id, tournament_name, season_year, round, start_date, home_name, away_name,
                           home_score, away_score, home_score_ht, away_score_ht, spectators, status, saved_at)
      VALUES (?, 'API-Sports historik', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'finished', ?)
      ON CONFLICT(event_id) DO UPDATE SET
        division_id = excluded.division_id, season_year = excluded.season_year, round = excluded.round, start_date = excluded.start_date,
        home_name = excluded.home_name, away_name = excluded.away_name, home_score = excluded.home_score, away_score = excluded.away_score,
        home_score_ht = excluded.home_score_ht, away_score_ht = excluded.away_score_ht, status = 'finished', saved_at = excluded.saved_at
      WHERE matches.division_id IS NOT excluded.division_id OR matches.season_year IS NOT excluded.season_year OR matches.round IS NOT excluded.round
         OR matches.start_date IS NOT excluded.start_date OR matches.home_name IS NOT excluded.home_name OR matches.away_name IS NOT excluded.away_name
         OR matches.home_score IS NOT excluded.home_score OR matches.away_score IS NOT excluded.away_score
         OR matches.home_score_ht IS NOT excluded.home_score_ht OR matches.away_score_ht IS NOT excluded.away_score_ht OR matches.status IS NOT 'finished'`)
    const now = new Date().toISOString()
    db.exec('BEGIN')
    for (const g of finished) {
      upsert.run(g.id, divisionId, tournament, season, g.round == null ? null : String(g.round), g.kickoff, g.home.name, g.away.name, g.homeScore, g.awayScore, g.ht?.[0] ?? null, g.ht?.[1] ?? null, now)
    }
    db.exec('COMMIT')
  } finally {
    db.close()
  }
  return finished.length
}

// ---------------------------------------------------------------- players per match

/** One player's numbers in one match (API-Sports' football matches) */
export interface PlayerGame {
  eventId: string
  playerId: number
  name: string
  teamId?: number
  team: string
  side?: 'home' | 'away'
  position?: string
  minutes?: number
  rating?: number
  goals: number
  assists: number
  yellow: number
  red: number
  shots?: number
  shotsOn?: number
  passes?: number
  keyPasses?: number
  saves?: number
  conceded?: number
  substitute?: boolean
  captain?: boolean
}

/** Every player's numbers for matches (replacing what was saved), and the matches checked that had none */
export function archivePlayerGames(rows: PlayerGame[], checked: string[]) {
  const lib = sqlite()
  if (!lib || (!rows.length && !checked.length)) return
  const db = new lib.DatabaseSync(archiveFile())
  try {
    db.exec('PRAGMA busy_timeout = 5000')
    db.exec(SCHEMA)
    const clear = db.prepare('DELETE FROM player_games WHERE event_id = ?')
    const add = db.prepare(
      `INSERT OR REPLACE INTO player_games (event_id, player_id, name, team_id, team, side, position, minutes, rating, goals, assists, yellow, red, shots, shots_on, passes, key_passes, saves, conceded, substitute, captain)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    const mark = db.prepare('INSERT OR REPLACE INTO players_checked (event_id, checked_at) VALUES (?, ?)')
    const now = new Date().toISOString()
    const v = (x: unknown) => (x === undefined ? null : x)
    db.exec('BEGIN')
    for (const id of new Set(rows.map((r) => r.eventId))) clear.run(id)
    for (const r of rows) {
      add.run(
        r.eventId, r.playerId, r.name, v(r.teamId), r.team, v(r.side), v(r.position), v(r.minutes), v(r.rating), r.goals, r.assists, r.yellow, r.red,
        v(r.shots), v(r.shotsOn), v(r.passes), v(r.keyPasses), v(r.saves), v(r.conceded), r.substitute ? 1 : 0, r.captain ? 1 : 0,
      )
    }
    for (const id of checked) mark.run(id, now)
    db.exec('COMMIT')
  } finally {
    db.close()
  }
}

/** Saved finished football matches whose players have not been fetched yet, newest first */
export function archiveMissingPlayers(limit: number): string[] {
  const lib = sqlite()
  if (!lib) return []
  let db: Db
  try {
    db = new lib.DatabaseSync(archiveFile())
  } catch {
    return []
  }
  try {
    db.exec('PRAGMA busy_timeout = 5000')
    db.exec(SCHEMA)
    return db
      .prepare(
        `SELECT m.event_id FROM matches m
          WHERE m.event_id LIKE 'football-%' AND m.status = 'finished'
            AND NOT EXISTS (SELECT 1 FROM players_checked c WHERE c.event_id = m.event_id)
          ORDER BY m.start_date DESC LIMIT ?`,
      )
      .all(limit)
      .map((r) => String(r.event_id))
  } catch {
    return []
  } finally {
    db.close()
  }
}

/** A player's matches with the match itself, newest first */
export function playerGames(playerId: number, limit = 400): (PlayerGame & { date: Date; tournament: string; home: string; away: string; homeScore: number; awayScore: number })[] {
  const lib = sqlite()
  if (!lib || !existsFile(archiveFile())) return []
  let db: Db
  try {
    db = new lib.DatabaseSync(archiveFile(), { readOnly: true })
  } catch {
    return []
  }
  try {
    return db
      .prepare(
        `SELECT p.*, m.start_date, m.tournament_name, m.home_name, m.away_name, m.home_score, m.away_score
           FROM player_games p JOIN matches m ON m.event_id = p.event_id
          WHERE p.player_id = ? ORDER BY m.start_date DESC LIMIT ?`,
      )
      .all(playerId, limit)
      .map((r) => ({
        eventId: String(r.event_id),
        playerId: Number(r.player_id),
        name: String(r.name ?? ''),
        teamId: r.team_id === null ? undefined : Number(r.team_id),
        team: String(r.team ?? ''),
        side: (r.side ?? undefined) as 'home' | 'away' | undefined,
        position: (r.position ?? undefined) as string | undefined,
        minutes: r.minutes === null ? undefined : Number(r.minutes),
        rating: r.rating === null ? undefined : Number(r.rating),
        goals: Number(r.goals ?? 0),
        assists: Number(r.assists ?? 0),
        yellow: Number(r.yellow ?? 0),
        red: Number(r.red ?? 0),
        shots: r.shots === null ? undefined : Number(r.shots),
        shotsOn: r.shots_on === null ? undefined : Number(r.shots_on),
        passes: r.passes === null ? undefined : Number(r.passes),
        keyPasses: r.key_passes === null ? undefined : Number(r.key_passes),
        saves: r.saves === null ? undefined : Number(r.saves),
        conceded: r.conceded === null ? undefined : Number(r.conceded),
        substitute: !!r.substitute,
        captain: !!r.captain,
        date: new Date(String(r.start_date)),
        tournament: String(r.tournament_name ?? ''),
        home: String(r.home_name ?? ''),
        away: String(r.away_name ?? ''),
        homeScore: Number(r.home_score ?? 0),
        awayScore: Number(r.away_score ?? 0),
      }))
  } catch {
    return []
  } finally {
    db.close()
  }
}

// Players by the name the sources write ("E. Haaland"), kept a while: a list's names are looked up on every page view
const idsByName = new Map<string, { at: number; players: { id: number; team: string }[] }>()

/** The players saved under each name, with the team they played for (for photos and links in lists that only have names) */
export function playersByName(names: string[]): Map<string, { id: number; team: string }[]> {
  const out = new Map<string, { id: number; team: string }[]>()
  const wanted = [...new Set(names)].filter((n) => {
    const hit = idsByName.get(n)
    if (hit && Date.now() - hit.at < 6 * 3_600_000) {
      out.set(n, hit.players)
      return false
    }
    return true
  })
  if (!wanted.length) return out
  const lib = sqlite()
  if (!lib || !existsFile(archiveFile())) return out
  let db: Db
  try {
    db = new lib.DatabaseSync(archiveFile(), { readOnly: true })
  } catch {
    return out
  }
  try {
    const rows = db
      .prepare(`SELECT DISTINCT player_id, name, team FROM player_games WHERE name IN (${wanted.map(() => '?').join(',')})`)
      .all(...wanted)
    for (const n of wanted) {
      const players = rows.filter((r) => r.name === n).map((r) => ({ id: Number(r.player_id), team: String(r.team ?? '') }))
      idsByName.set(n, { at: Date.now(), players })
      out.set(n, players)
    }
  } catch {
    // An older bank without the table
  } finally {
    db.close()
  }
  return out
}

/** The players' numbers in one match (best rated first) */
export function eventPlayers(eventId: string): PlayerGame[] {
  const lib = sqlite()
  if (!lib || !existsFile(archiveFile())) return []
  let db: Db
  try {
    db = new lib.DatabaseSync(archiveFile(), { readOnly: true })
  } catch {
    return []
  }
  try {
    return db
      .prepare('SELECT * FROM player_games WHERE event_id = ? ORDER BY rating DESC')
      .all(eventId)
      .map((r) => ({
        eventId: String(r.event_id),
        playerId: Number(r.player_id),
        name: String(r.name ?? ''),
        teamId: r.team_id === null ? undefined : Number(r.team_id),
        team: String(r.team ?? ''),
        side: (r.side ?? undefined) as 'home' | 'away' | undefined,
        position: (r.position ?? undefined) as string | undefined,
        minutes: r.minutes === null ? undefined : Number(r.minutes),
        rating: r.rating === null ? undefined : Number(r.rating),
        goals: Number(r.goals ?? 0),
        assists: Number(r.assists ?? 0),
        yellow: Number(r.yellow ?? 0),
        red: Number(r.red ?? 0),
        shots: r.shots === null ? undefined : Number(r.shots),
        shotsOn: r.shots_on === null ? undefined : Number(r.shots_on),
        passes: r.passes === null ? undefined : Number(r.passes),
        keyPasses: r.key_passes === null ? undefined : Number(r.key_passes),
        saves: r.saves === null ? undefined : Number(r.saves),
        conceded: r.conceded === null ? undefined : Number(r.conceded),
        substitute: !!r.substitute,
        captain: !!r.captain,
      }))
  } catch {
    return []
  } finally {
    db.close()
  }
}

/**
 * A team's players over a set of matches (a season in a league): appearances, minutes, goals, assists, average
 * rating and the rest, by the source's team id. The matches' ids use the primary key, so only those rows are read.
 */
export function teamPlayerTotals(eventIds: string[], teamId: number) {
  const lib = sqlite()
  if (!lib || !eventIds.length || !existsFile(archiveFile())) return []
  let db: Db
  try {
    db = new lib.DatabaseSync(archiveFile(), { readOnly: true })
  } catch {
    return []
  }
  try {
    const marks = eventIds.map(() => '?').join(',')
    return db
      .prepare(
        `SELECT player_id, MAX(name) AS name, MAX(position) AS position, COUNT(*) AS apps, SUM(COALESCE(minutes, 0)) AS minutes,
          SUM(goals) AS goals, SUM(assists) AS assists, AVG(rating) AS rating, SUM(COALESCE(key_passes, 0)) AS key_passes,
          SUM(COALESCE(shots, 0)) AS shots, SUM(COALESCE(shots_on, 0)) AS shots_on, SUM(COALESCE(saves, 0)) AS saves,
          SUM(yellow) AS yellow, SUM(red) AS red
        FROM player_games WHERE event_id IN (${marks}) AND team_id = ? GROUP BY player_id`,
      )
      .all(...eventIds, teamId)
      .map((r) => ({
        id: Number(r.player_id),
        name: String(r.name ?? ''),
        position: (r.position ?? undefined) as string | undefined,
        apps: Number(r.apps ?? 0),
        minutes: Number(r.minutes ?? 0),
        goals: Number(r.goals ?? 0),
        assists: Number(r.assists ?? 0),
        rating: r.rating === null ? undefined : Math.round(Number(r.rating) * 100) / 100,
        keyPasses: Number(r.key_passes ?? 0),
        shots: Number(r.shots ?? 0),
        shotsOn: Number(r.shots_on ?? 0),
        saves: Number(r.saves ?? 0),
        yellow: Number(r.yellow ?? 0),
        red: Number(r.red ?? 0),
      }))
  } catch {
    return []
  } finally {
    db.close()
  }
}

/** How many player-match rows and checked matches the bank has (for /admin/data) */
export function playerGamesStatus() {
  const lib = sqlite()
  if (!lib || !existsFile(archiveFile())) return { rows: 0, matches: 0 }
  let db: Db
  try {
    db = new lib.DatabaseSync(archiveFile(), { readOnly: true })
  } catch {
    return { rows: 0, matches: 0 }
  }
  try {
    return {
      rows: Number(db.prepare('SELECT COUNT(*) AS n FROM player_games').get()?.n ?? 0),
      matches: Number(db.prepare('SELECT COUNT(*) AS n FROM players_checked').get()?.n ?? 0),
    }
  } catch {
    return { rows: 0, matches: 0 }
  } finally {
    db.close()
  }
}

function existsFile(file: string) {
  try {
    return statSync(file).isFile()
  } catch {
    return false
  }
}
