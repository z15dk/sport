import 'server-only'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { cacheDir } from './tsdb'

// Proof of consent (GDPR art. 7(1)): every choice in the cookie banner is logged here
// with the banner's own random id for that browser, the time, the banner's version and
// what was chosen – no IP address, nothing that points to a person. The id is shown in
// the banner's settings, so a visitor (or Datatilsynet) can be matched to their record.
// Kept 3 years. SQLite consent.db (CONSENT_DB).

type Row = Record<string, unknown>
interface Db {
  exec(sql: string): void
  prepare(sql: string): { run(...p: unknown[]): unknown; all(...p: unknown[]): Row[]; get(...p: unknown[]): Row | undefined }
}

const holder = globalThis as typeof globalThis & { __scorelineConsentDb?: Db | null }
const file = () => process.env.CONSENT_DB ?? path.join(/*turbopackIgnore: true*/ cacheDir(), 'data', 'consent.db')
const KEEP_MS = 3 * 365 * 86_400_000

function db(): Db | undefined {
  if (holder.__scorelineConsentDb !== undefined) return holder.__scorelineConsentDb ?? undefined
  try {
    const sqlite = process.getBuiltinModule?.('node:sqlite') as { DatabaseSync: new (f: string) => Db } | undefined
    if (!sqlite) throw new Error('no sqlite')
    mkdirSync(path.dirname(file()), { recursive: true })
    const d = new sqlite.DatabaseSync(file())
    d.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000')
    d.exec('CREATE TABLE IF NOT EXISTS consents (id TEXT, at INTEGER, version INTEGER, stats INTEGER, marketing INTEGER, action TEXT)')
    d.exec('CREATE INDEX IF NOT EXISTS consents_id ON consents (id)')
    d.exec('CREATE INDEX IF NOT EXISTS consents_at ON consents (at)')
    d.prepare('DELETE FROM consents WHERE at < ?').run(Date.now() - KEEP_MS)
    holder.__scorelineConsentDb = d
    return d
  } catch {
    holder.__scorelineConsentDb = null
    return undefined
  }
}

export type ConsentAction = 'accept' | 'reject' | 'custom' | 'withdraw'
const ACTIONS: ConsentAction[] = ['accept', 'reject', 'custom', 'withdraw']
const ID = /^[a-z0-9]{16,32}$/

/** One choice from the banner; false when it isn't a proper one */
export function logConsent(input: { id: unknown; version: unknown; stats: unknown; marketing: unknown; action: unknown }): boolean {
  const id = String(input.id ?? '')
  const action = String(input.action ?? '') as ConsentAction
  const version = Number(input.version)
  if (!ID.test(id) || !ACTIONS.includes(action) || !Number.isInteger(version) || version < 1 || version > 1000) return false
  const d = db()
  if (!d) return false
  // At most a few choices per id per hour (a script hammering the endpoint fills nothing)
  const recent = Number(d.prepare('SELECT COUNT(*) AS n FROM consents WHERE id = ? AND at > ?').get(id, Date.now() - 3_600_000)?.n ?? 0)
  if (recent >= 10) return false
  d.prepare('INSERT INTO consents (id, at, version, stats, marketing, action) VALUES (?, ?, ?, ?, ?, ?)').run(id, Date.now(), version, input.stats ? 1 : 0, input.marketing ? 1 : 0, action)
  return true
}

/** For /admin/indstillinger: the last 30 days by choice, and one id's history */
export function consentStats(lookup?: string) {
  const d = db()
  if (!d) return undefined
  const from = Date.now() - 30 * 86_400_000
  const rows = d.prepare('SELECT action, COUNT(*) AS n FROM consents WHERE at >= ? GROUP BY action').all(from)
  const by = Object.fromEntries(rows.map((r) => [String(r.action), Number(r.n)])) as Partial<Record<ConsentAction, number>>
  const total = Object.values(by).reduce((a, b) => a + (b ?? 0), 0)
  const found = lookup && ID.test(lookup) ? d.prepare('SELECT at, version, stats, marketing, action FROM consents WHERE id = ? ORDER BY at DESC LIMIT 50').all(lookup).map((r) => ({ at: Number(r.at), version: Number(r.version), stats: !!r.stats, marketing: !!r.marketing, action: String(r.action) as ConsentAction })) : undefined
  return { by, total, found }
}
