import 'server-only'
import { existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs'
import path from 'node:path'

// The match pages' extras from API-Sports (head-to-head, form, tables, goals,
// statistics, line-ups, players …) by key, in SQLite (h2h.db) instead of one
// JSON file kept whole in memory and written whole on every change: an entry
// is read from disk when asked for, the last few hundred stay in memory, and
// changes are written in one transaction a moment later. The old h2h.json is
// moved in once and then renamed (h2h.json.flyttet).

type Row = Record<string, unknown>
interface Stmt {
  get(...p: unknown[]): Row | undefined
  run(...p: unknown[]): unknown
}
interface Db {
  exec(sql: string): void
  prepare(sql: string): Stmt
  close(): void
}

export interface KvStore<E extends { fetchedAt: number }> {
  /** Reads and writes like a plain object: `entries[key]`, `entries[key] = e`, `delete entries[key]` */
  entries: Record<string, E>
  /** Requests spent on extras per API and UTC day */
  spent: Record<string, { day: string; count: number }>
  /** Writes the changes now */
  flush(): void
  /** Writes the changes (also to `spent`) in a moment */
  touch(): void
}

const CACHE = 400
const MAX_AGE = 30 * 86_400_000

export function kvStore<E extends { fetchedAt: number }>(file: string, legacyJson?: string): KvStore<E> {
  const sqlite = process.getBuiltinModule?.('node:sqlite') as { DatabaseSync: new (f: string) => Db } | undefined
  let db: Db | undefined
  try {
    if (sqlite) {
      mkdirSync(path.dirname(file), { recursive: true })
      db = new sqlite.DatabaseSync(file)
      db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL')
      db.exec('CREATE TABLE IF NOT EXISTS entries (key TEXT PRIMARY KEY, fetched_at INTEGER, data TEXT)')
      db.exec('CREATE INDEX IF NOT EXISTS entries_fetched ON entries (fetched_at)')
    }
  } catch {
    db = undefined
  }
  const getStmt = db?.prepare('SELECT data FROM entries WHERE key = ?')
  const putStmt = db?.prepare('INSERT OR REPLACE INTO entries (key, fetched_at, data) VALUES (?, ?, ?)')
  const delStmt = db?.prepare('DELETE FROM entries WHERE key = ?')

  // Recently used entries, oldest first (a Map keeps insertion order)
  const cache = new Map<string, E | null>()
  const dirty = new Map<string, E | null>()
  const remember = (key: string, e: E | null) => {
    cache.delete(key)
    cache.set(key, e)
    while (cache.size > CACHE) {
      const oldest = cache.keys().next().value as string
      // Unsaved changes stay until they are written
      if (dirty.has(oldest)) break
      cache.delete(oldest)
    }
  }
  // Read from disk again after half a minute: another process (the split server's background process) may have written it
  const readAt = new Map<string, number>()
  const read = (key: string): E | undefined => {
    if (cache.has(key) && (dirty.has(key) || Date.now() - (readAt.get(key) ?? 0) < 30_000)) {
      const e = cache.get(key)!
      remember(key, e)
      return e ?? undefined
    }
    let e: E | null = null
    try {
      const row = getStmt?.get(key)
      if (row?.data) e = JSON.parse(String(row.data)) as E
    } catch {
      e = null
    }
    remember(key, e)
    readAt.set(key, Date.now())
    if (readAt.size > CACHE * 4) for (const k of readAt.keys()) if (!cache.has(k)) readAt.delete(k)
    return e ?? undefined
  }

  const spent: KvStore<E>['spent'] = (() => {
    try {
      const row = getStmt?.get('__spent')
      return row?.data ? (JSON.parse(String(row.data)) as KvStore<E>['spent']) : {}
    } catch {
      return {}
    }
  })()

  let timer: ReturnType<typeof setTimeout> | undefined
  let lastPrune = 0
  const flush = () => {
    if (timer) clearTimeout(timer)
    timer = undefined
    if (!db || !putStmt || !delStmt) return
    try {
      db.exec('BEGIN')
      for (const [key, e] of dirty) {
        if (e) putStmt.run(key, e.fetchedAt, JSON.stringify(e))
        else delStmt.run(key)
      }
      putStmt.run('__spent', Date.now(), JSON.stringify(spent))
      // Old entries go after a month (checked once an hour); a game's line-ups, statistics and goals are kept for good (they never change, and fetching them again costs calls)
      if (Date.now() - lastPrune > 3_600_000) {
        lastPrune = Date.now()
        db.prepare(
          "DELETE FROM entries WHERE fetched_at < ? AND key != '__spent' AND key NOT LIKE '%|lineups|%' AND key NOT LIKE '%|stats|%' AND key NOT LIKE '%|events|%' AND key NOT LIKE '%|subs|%'",
        ).run(Date.now() - MAX_AGE)
      }
      db.exec('COMMIT')
      dirty.clear()
    } catch {
      try {
        db.exec('ROLLBACK')
      } catch {
        // nothing begun
      }
    }
  }
  const later = () => {
    timer ??= setTimeout(flush, 2_000)
    timer.unref?.()
  }

  // The old JSON file, once
  if (db && putStmt && legacyJson && existsSync(legacyJson)) {
    try {
      const old = JSON.parse(readFileSync(legacyJson, 'utf8')) as { entries?: Record<string, E>; spent?: KvStore<E>['spent'] }
      db.exec('BEGIN')
      for (const [key, e] of Object.entries(old.entries ?? {})) if (e && Date.now() - e.fetchedAt < MAX_AGE) putStmt.run(key, e.fetchedAt, JSON.stringify(e))
      db.exec('COMMIT')
      Object.assign(spent, old.spent ?? {})
      renameSync(legacyJson, `${legacyJson}.flyttet`)
    } catch {
      try {
        db.exec('ROLLBACK')
      } catch {
        // nothing begun
      }
    }
  }

  const entries = new Proxy({} as Record<string, E>, {
    get: (_t, key) => (typeof key === 'string' ? read(key) : undefined),
    set: (_t, key, value) => {
      if (typeof key !== 'string') return false
      remember(key, value as E)
      dirty.set(key, value as E)
      later()
      return true
    },
    deleteProperty: (_t, key) => {
      if (typeof key !== 'string') return false
      remember(key, null)
      dirty.set(key, null)
      later()
      return true
    },
    has: (_t, key) => typeof key === 'string' && read(key) !== undefined,
  })

  return {
    entries,
    spent,
    flush,
    touch: later,
  }
}

/** The server's memory and the big data files, for /admin/data */
export function memoryStatus(files: Record<string, string>) {
  const mb = (n: number) => Math.round(n / 1_048_576)
  const m = process.memoryUsage()
  const size = (f: string) => {
    try {
      const { statSync } = process.getBuiltinModule('node:fs') as typeof import('node:fs')
      let n = statSync(f).size
      for (const extra of ['-wal']) {
        try {
          n += statSync(f + extra).size
        } catch {
          // no write-ahead log
        }
      }
      return mb(n)
    } catch {
      return undefined
    }
  }
  return {
    rss: mb(m.rss),
    heap: mb(m.heapUsed),
    external: mb(m.external + (m.arrayBuffers ?? 0)),
    files: Object.entries(files).map(([name, f]) => ({ name, mb: size(f) })),
  }
}
