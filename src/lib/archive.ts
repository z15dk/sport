import 'server-only'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DIVISIONS, seasonOf } from '../data/leagues'
import { getRealData, type RealEvent } from '../data/real'
import { cacheDir } from './tsdb'

// Scoreline's own statistics bank: every finished match we have seen, from
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
  CREATE INDEX IF NOT EXISTS matches_date ON matches (start_date);
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
  spectators?: number
}

/** Every archived match, newest first */
export function readArchive(): ArchivedMatch[] {
  const lib = sqlite()
  if (!lib) return []
  let db: Db
  try {
    db = new lib.DatabaseSync(archiveFile(), { readOnly: true })
  } catch {
    return [] // no archive yet
  }
  try {
    return db
      .prepare(
        `SELECT event_id, division_id, tournament_name, season_year, start_date, home_name, away_name, home_score, away_score, spectators
           FROM matches WHERE status = 'finished' ORDER BY start_date DESC`,
      )
      .all()
      .map((r) => ({
        id: String(r.event_id),
        divisionId: String(r.division_id ?? ''),
        tournament: String(r.tournament_name ?? ''),
        season: String(r.season_year ?? ''),
        date: new Date(String(r.start_date)),
        homeName: String(r.home_name ?? ''),
        awayName: String(r.away_name ?? ''),
        homeScore: Number(r.home_score),
        awayScore: Number(r.away_score),
        spectators: r.spectators == null ? undefined : Number(r.spectators),
      }))
  } catch {
    return []
  } finally {
    db.close()
  }
}

/** Numbers for the status page */
export function archiveStatus() {
  const lib = sqlite()
  let byDivision: { division: string; matches: number; incidents: number }[] = []
  let total = state.saved
  if (lib) {
    try {
      const db = new lib.DatabaseSync(archiveFile(), { readOnly: true })
      try {
        byDivision = db
          .prepare(
            `SELECT m.tournament_name AS division, COUNT(DISTINCT m.event_id) AS matches, COUNT(i.event_id) AS incidents
               FROM matches m LEFT JOIN incidents i ON i.event_id = m.event_id GROUP BY m.tournament_name ORDER BY matches DESC`,
          )
          .all()
          .map((r) => ({ division: String(r.division), matches: Number(r.matches), incidents: Number(r.incidents) }))
        total = byDivision.reduce((n, r) => n + r.matches, 0)
      } finally {
        db.close()
      }
    } catch {
      // no archive yet
    }
  }
  return { file: archiveFile(), total, byDivision, lastRun: state.lastRun ?? null, lastError: state.lastError ?? null }
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
      VALUES (?, 'API-Sports historik', ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, NULL, 'finished', ?)
      ON CONFLICT(event_id) DO NOTHING`)
    const now = new Date().toISOString()
    db.exec('BEGIN')
    for (const g of finished) {
      upsert.run(g.id, divisionId, tournament, season, g.kickoff, g.home.name, g.away.name, g.homeScore, g.awayScore, g.ht?.[0] ?? null, g.ht?.[1] ?? null, now)
    }
    db.exec('COMMIT')
  } finally {
    db.close()
  }
  return finished.length
}
