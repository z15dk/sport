import { chmodSync, mkdirSync } from 'node:fs'
import path from 'node:path'

// billeder.db (SQLite): the photo queue, tags, clubs, DBU team sheets and squads,
// a log of every processed photo and the AI quota used per day.
//
// Photo status: ny → behandles → tagget → godkendt (phase 2) → arkiveret (phase 3),
// or fejl; slettet = a borrowed photo whose loan ran out (the row stays as a record
// without picture or tags, so the file is never taken in again). `behandles` is a lease (lease_until): a run that stops halfway leaves
// the photo to be picked up again once the lease runs out, never twice at once.

export type Row = Record<string, unknown>
export interface Stmt {
  run(...params: unknown[]): { lastInsertRowid?: number | bigint; changes?: number | bigint }
  all(...params: unknown[]): Row[]
  get(...params: unknown[]): Row | undefined
}
export interface Db {
  exec(sql: string): void
  prepare(sql: string): Stmt
  close(): void
}
type Sqlite = { DatabaseSync: new (file: string, opts?: { readOnly?: boolean }) => Db }

export type PhotoStatus = 'ny' | 'behandles' | 'tagget' | 'godkendt' | 'fejl' | 'arkiveret' | 'slettet'

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    drive_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    path TEXT NOT NULL,
    md5 TEXT,
    size INTEGER,
    club TEXT,
    club_id TEXT,
    opponent TEXT,
    opponent_id TEXT,
    match_date TEXT,
    taken_at TEXT,
    width INTEGER,
    height INTEGER,
    status TEXT NOT NULL DEFAULT 'ny',
    situation TEXT,
    review INTEGER NOT NULL DEFAULT 0,
    review_reasons TEXT,
    review_cost INTEGER NOT NULL DEFAULT 0,
    vision_json TEXT,
    vision_model TEXT,
    web_drive_id TEXT,
    lease_until INTEGER,
    attempts INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    archive_state TEXT,
    created_at TEXT NOT NULL,
    processed_at TEXT,
    approved_at TEXT,
    last_used_at TEXT
  );
  CREATE INDEX IF NOT EXISTS photos_status ON photos (status, id);
  CREATE INDEX IF NOT EXISTS photos_review ON photos (review, review_cost);
  CREATE INDEX IF NOT EXISTS photos_club ON photos (club_id, match_date);

  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
    number INTEGER,
    jersey_color TEXT,
    side TEXT NOT NULL DEFAULT 'ukendt',
    confidence REAL,
    ymin INTEGER, xmin INTEGER, ymax INTEGER, xmax INTEGER,
    player_name TEXT,
    name_source TEXT,
    note TEXT,
    source TEXT NOT NULL DEFAULT 'ai',
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS tags_photo ON tags (photo_id);
  CREATE INDEX IF NOT EXISTS tags_number ON tags (number, side);
  CREATE INDEX IF NOT EXISTS tags_name ON tags (player_name);

  CREATE TABLE IF NOT EXISTS clubs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    aliases TEXT NOT NULL DEFAULT '[]',
    colors TEXT NOT NULL DEFAULT '[]',
    extra_colors TEXT NOT NULL DEFAULT '[]',
    kit TEXT,
    dbu_team TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS matches (
    match_key TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    home_id TEXT NOT NULL,
    away_id TEXT NOT NULL,
    source TEXT NOT NULL,
    url TEXT,
    has_lineups INTEGER NOT NULL DEFAULT 0,
    fetched_at TEXT
  );
  CREATE INDEX IF NOT EXISTS matches_date ON matches (date);

  CREATE TABLE IF NOT EXISTS lineups (
    match_key TEXT NOT NULL,
    club_id TEXT NOT NULL,
    number INTEGER NOT NULL,
    name TEXT NOT NULL,
    reserve INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (match_key, club_id, number, name)
  );

  CREATE TABLE IF NOT EXISTS squads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    club_id TEXT NOT NULL,
    number INTEGER NOT NULL,
    name TEXT NOT NULL,
    valid_from TEXT,
    valid_to TEXT,
    uncertain INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'manuel'
  );
  CREATE INDEX IF NOT EXISTS squads_number ON squads (club_id, number);

  CREATE TABLE IF NOT EXISTS photo_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    photo_id INTEGER,
    at TEXT NOT NULL,
    step TEXT NOT NULL,
    ok INTEGER NOT NULL,
    ms INTEGER,
    message TEXT
  );
  CREATE INDEX IF NOT EXISTS photo_log_photo ON photo_log (photo_id);

  CREATE TABLE IF NOT EXISTS quota (
    day TEXT NOT NULL,
    provider TEXT NOT NULL,
    calls INTEGER NOT NULL DEFAULT 0,
    limited INTEGER NOT NULL DEFAULT 0,
    last_limited_at TEXT,
    PRIMARY KEY (day, provider)
  );

  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`

export function openPhotoDb(file: string): Db {
  const lib = process.getBuiltinModule?.('node:sqlite') as Sqlite | undefined
  if (!lib) throw new Error('node:sqlite findes ikke i denne Node-version (kræver Node 22.5+)')
  mkdirSync(path.dirname(file), { recursive: true })
  const db = new lib.DatabaseSync(file)
  // Only the app's own user may read it (the server has other users; SQLite gives -wal/-shm the same mode)
  try {
    chmodSync(file, 0o600)
  } catch {
    // Not ours to change (tests, read-only copies)
  }
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON')
  db.exec(SCHEMA)
  // Columns added after the first release
  for (const sql of [
    'ALTER TABLE tags ADD COLUMN back_name TEXT',
    // Rights: the credit shown with the photo (empty = PHOTOS_DEFAULT_CREDIT) and, for borrowed photos, the last day we may keep it
    'ALTER TABLE photos ADD COLUMN credit TEXT',
    'ALTER TABLE photos ADD COLUMN license_until TEXT',
    'ALTER TABLE photos ADD COLUMN deleted_at TEXT',
    'ALTER TABLE photos ADD COLUMN deleted_reason TEXT',
  ]) {
    try {
      db.exec(sql)
    } catch {
      // Already there
    }
  }
  return db
}

export function transaction<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE')
  try {
    const out = fn()
    db.exec('COMMIT')
    return out
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

export const nowIso = () => new Date().toISOString()

export function getMeta(db: Db, key: string): string | undefined {
  const v = db.prepare('SELECT value FROM meta WHERE key = ?').get(key)?.value
  return v == null ? undefined : String(v)
}

export function setMeta(db: Db, key: string, value: string) {
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value)
}

export function logStep(db: Db, photoId: number | null, step: string, ok: boolean, ms?: number, message?: string) {
  db.prepare('INSERT INTO photo_log (photo_id, at, step, ok, ms, message) VALUES (?, ?, ?, ?, ?, ?)').run(photoId, nowIso(), step, ok ? 1 : 0, ms ?? null, message?.slice(0, 1000) ?? null)
}

/** Google's free quota resets at midnight Pacific time */
export const quotaDay = (d = new Date()) => d.toLocaleDateString('sv-SE', { timeZone: 'America/Los_Angeles' })

export function quotaUsed(db: Db, provider: string, day = quotaDay()) {
  const r = db.prepare('SELECT calls, limited FROM quota WHERE day = ? AND provider = ?').get(day, provider)
  return { calls: Number(r?.calls ?? 0), limited: Number(r?.limited ?? 0) }
}

export function countCall(db: Db, provider: string, limited = false) {
  db.prepare(
    `INSERT INTO quota (day, provider, calls, limited, last_limited_at) VALUES (?, ?, 1, ?, ?)
     ON CONFLICT(day, provider) DO UPDATE SET calls = calls + 1, limited = limited + excluded.limited,
       last_limited_at = COALESCE(excluded.last_limited_at, last_limited_at)`,
  ).run(quotaDay(), provider, limited ? 1 : 0, limited ? nowIso() : null)
}
