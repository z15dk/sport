// "Din klub i indbakken": the weekly mail per club (sign-up on the club pages and in Mine hold). This is the pure part,
// tested in tests/klubmail: the address check, the ISO week and the Monday window, the store of subscribers over a
// node:sqlite database (double opt-in, at most 3 confirmation mails per address a day, unconfirmed sign-ups gone after
// 7 days, the address deleted on unsubscribe) and the throttled weekly queue (one mail per subscriber per ISO week,
// claimed before it is sent so a restart never sends twice, a daily cap kept well under Gmail's limit).
// The server side (the file, sendMail, the site's data) is in src/lib/klubmail/server.ts.

import { createHash, randomBytes } from 'node:crypto'
import { addDays, danishTime, isoDate } from '../time.ts'

/** Unconfirmed sign-ups (and clubs waiting to be confirmed) are deleted after this */
export const PENDING_MS = 7 * 86_400_000
/** Confirmation mails to one address per day (no mail bombing through the form) */
export const CONFIRMS_PER_DAY = 3
/** At most this many clubs per subscriber */
export const MAX_CLUBS = 10
/** A subscriber whose address the mail server refused this many weeks in a row is removed */
export const MAX_FAILS = 3

// ---- Addresses ----

/** The address as it is stored: trimmed and in small letters */
export const normalEmail = (s: string) => s.trim().toLowerCase()

const EMAIL = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/i

/** A plausible address (no spaces, one @, a domain with a dot, no double dots, not too long) */
export function validEmail(s: string): boolean {
  const e = normalEmail(s)
  return e.length <= 254 && EMAIL.test(e) && !e.includes('..') && !e.startsWith('.') && e.split('@')[0].length <= 64 && !e.split('@')[0].endsWith('.')
}

/** For logs and the admin: never the whole address ("r***@gmail.com") */
export const maskEmail = (s: string) => {
  const [user, domain] = normalEmail(s).split('@')
  return domain ? `${user.slice(0, 1)}***@${domain}` : '***'
}

/** The address as a hash (the per-address limit outlives a deleted sign-up without keeping the address) */
export const emailHash = (s: string) => createHash('sha256').update(normalEmail(s)).digest('hex').slice(0, 32)

export const newToken = () => randomBytes(24).toString('hex')
const TOKEN = /^[a-f0-9]{48}$/
export const validToken = (t: unknown): t is string => typeof t === 'string' && TOKEN.test(t)

// ---- Weeks and the Monday window ----

/** The ISO week of a date ("2026-10-12" → "2026-W42") */
export function isoWeek(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  const day = t.getUTCDay() || 7
  // The Thursday of the week decides the year
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const year = t.getUTCFullYear()
  const week = Math.ceil(((t.getTime() - Date.UTC(year, 0, 1)) / 86_400_000 + 1) / 7)
  return `${year}-W${String(week).padStart(2, '0')}`
}

/** 1 = Monday … 7 = Sunday, in Danish time */
export const danishWeekday = (now: number) => new Date(`${isoDate(now)}T12:00:00Z`).getUTCDay() || 7

/** The start of today in Danish time */
export const danishDayStart = (now: number) => danishTime(isoDate(now), '00:00').getTime()

/** The hour the weekly mail goes out on Monday (Danish time) */
export const SEND_HOUR = 7
/** Mails the daily cap stopped on Monday go out on the next days, up to and including this weekday (3 = Wednesday) */
export const LAST_WEEKDAY = 3

/**
 * The week whose mail may go out now: from Monday 07.00 Danish time to the end of Wednesday (what the daily cap
 * held back goes on Tuesday and Wednesday). `cutoff`: only addresses confirmed before Monday 07.00 get this week's
 * mail, so one confirmed on Tuesday waits for next Monday.
 */
export function sendWindow(now: number): { week: string; cutoff: number } | undefined {
  const day = isoDate(now)
  const wd = danishWeekday(now)
  if (wd > LAST_WEEKDAY) return undefined
  const monday = addDays(day, 1 - wd)
  const start = danishTime(monday, `${String(SEND_HOUR).padStart(2, '0')}:00`).getTime()
  if (now < start) return undefined
  return { week: isoWeek(monday), cutoff: start }
}

// ---- The store ----

type Row = Record<string, unknown>
export interface Db {
  exec(sql: string): void
  prepare(sql: string): { run(...p: unknown[]): { changes: number | bigint }; all(...p: unknown[]): Row[]; get(...p: unknown[]): Row | undefined }
}

export interface Subscriber {
  id: number
  email: string
  clubs: string[]
  pending: string[]
  token: string
  tokenAt: number
  unsub: string
  created: number
  confirmed?: number
  fails: number
}

const list = (v: unknown): string[] => {
  try {
    const a = JSON.parse(String(v ?? '[]')) as unknown
    return Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

const toSub = (r: Row): Subscriber => ({
  id: Number(r.id),
  email: String(r.email),
  clubs: list(r.clubs),
  pending: list(r.pending),
  token: String(r.token),
  tokenAt: Number(r.token_at),
  unsub: String(r.unsub),
  created: Number(r.created),
  confirmed: r.confirmed == null ? undefined : Number(r.confirmed),
  fails: Number(r.fails ?? 0),
})

export type SignUp =
  /** A confirmation mail is to be sent with this token */
  | { kind: 'confirm'; token: string; sub: Subscriber }
  /** Already getting the mail for every one of these clubs: nothing to send */
  | { kind: 'already' }
  /** Three confirmation mails to the address today already */
  | { kind: 'limited' }

export class KlubmailStore {
  private db: Db
  constructor(db: Db) {
    this.db = db
    db.exec(`CREATE TABLE IF NOT EXISTS subscribers (
      id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, clubs TEXT NOT NULL DEFAULT '[]', pending TEXT NOT NULL DEFAULT '[]',
      token TEXT NOT NULL, token_at INTEGER NOT NULL, unsub TEXT NOT NULL, created INTEGER NOT NULL, confirmed INTEGER, fails INTEGER NOT NULL DEFAULT 0)`)
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS subscribers_token ON subscribers (token)')
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS subscribers_unsub ON subscribers (unsub)')
    // One row per subscriber and ISO week: claimed before the mail is sent, so a restart never sends it twice
    db.exec('CREATE TABLE IF NOT EXISTS sends (sub INTEGER NOT NULL, week TEXT NOT NULL, at INTEGER NOT NULL, ok INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (sub, week))')
    db.exec('CREATE INDEX IF NOT EXISTS sends_at ON sends (at)')
    // The confirmation mails per address (as a hash) for the daily limit
    db.exec('CREATE TABLE IF NOT EXISTS confirm_mails (who TEXT NOT NULL, at INTEGER NOT NULL)')
    db.exec('CREATE INDEX IF NOT EXISTS confirm_mails_who ON confirm_mails (who, at)')
    // What happened, without the address (the admin's counts: sign-ups, confirmations, unsubscriptions)
    db.exec('CREATE TABLE IF NOT EXISTS events (at INTEGER NOT NULL, kind TEXT NOT NULL, club TEXT)')
    db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
  }

  private event(kind: string, clubs: (string | undefined)[], now: number) {
    const stmt = this.db.prepare('INSERT INTO events (at, kind, club) VALUES (?, ?, ?)')
    for (const c of clubs.length ? clubs : [undefined]) stmt.run(now, kind, c ?? null)
  }

  byEmail(email: string): Subscriber | undefined {
    const r = this.db.prepare('SELECT * FROM subscribers WHERE email = ?').get(normalEmail(email))
    return r ? toSub(r) : undefined
  }

  byToken(token: string): Subscriber | undefined {
    if (!validToken(token)) return undefined
    const r = this.db.prepare('SELECT * FROM subscribers WHERE token = ?').get(token)
    return r ? toSub(r) : undefined
  }

  byUnsub(token: string): Subscriber | undefined {
    if (!validToken(token)) return undefined
    const r = this.db.prepare('SELECT * FROM subscribers WHERE unsub = ?').get(token)
    return r ? toSub(r) : undefined
  }

  /** Confirmation mails sent to the address in the last 24 hours */
  confirmMailsFor(email: string, now: number): number {
    return Number(this.db.prepare('SELECT COUNT(*) AS n FROM confirm_mails WHERE who = ? AND at > ?').get(emailHash(email), now - 86_400_000)?.n ?? 0)
  }

  /** Counts a confirmation mail that was sent (for the per-address limit and the day's total) */
  noteConfirmMail(email: string, now: number) {
    this.db.prepare('INSERT INTO confirm_mails (who, at) VALUES (?, ?)').run(emailHash(email), now)
  }

  /**
   * A sign-up from the form: a new address gets a pending row, a known one the new clubs as pending (confirmed by the
   * link in the mail). The caller sends the confirmation mail with the token and then calls noteConfirmMail.
   */
  signUp(email: string, clubs: string[], now: number): SignUp {
    const e = normalEmail(email)
    const want = [...new Set(clubs)].slice(0, MAX_CLUBS)
    const known = this.byEmail(e)
    const fresh = want.filter((c) => !known?.clubs.includes(c))
    if (known && !fresh.length) return { kind: 'already' }
    if (this.confirmMailsFor(e, now) >= CONFIRMS_PER_DAY) return { kind: 'limited' }
    if (!known) {
      const token = newToken()
      this.db.prepare('INSERT INTO subscribers (email, clubs, pending, token, token_at, unsub, created) VALUES (?, ?, ?, ?, ?, ?, ?)').run(e, '[]', JSON.stringify(fresh), token, now, newToken(), now)
      this.event('signup', fresh, now)
      return { kind: 'confirm', token, sub: this.byEmail(e)! }
    }
    // The same link as before keeps working; the clubs asked for now join the pending ones (within the limit)
    const pending = [...new Set([...known.pending, ...fresh])].filter((c) => !known.clubs.includes(c)).slice(0, Math.max(0, MAX_CLUBS - known.clubs.length))
    if (!pending.length) return { kind: 'already' }
    this.db.prepare('UPDATE subscribers SET pending = ?, token_at = ? WHERE id = ?').run(JSON.stringify(pending), now, known.id)
    this.event('signup', fresh, now)
    return { kind: 'confirm', token: known.token, sub: this.byEmail(e)! }
  }

  /** The link in the confirmation mail: the pending clubs become confirmed. Undefined for an unknown or expired link */
  confirm(token: string, now: number): Subscriber | undefined {
    const s = this.byToken(token)
    if (!s) return undefined
    // Clicked again later: already confirmed, nothing waiting
    if (!s.pending.length) return s.confirmed ? s : undefined
    if (now - s.tokenAt > PENDING_MS) return undefined
    const added = s.pending.filter((c) => !s.clubs.includes(c))
    const clubs = [...s.clubs, ...added].slice(0, MAX_CLUBS)
    this.db.prepare('UPDATE subscribers SET clubs = ?, pending = ?, confirmed = COALESCE(confirmed, ?) WHERE id = ?').run(JSON.stringify(clubs), '[]', now, s.id)
    if (added.length) this.event('confirm', added, now)
    return { ...s, clubs, pending: [], confirmed: s.confirmed ?? now }
  }

  /** The unsubscribe link: the address is deleted at once. Undefined when the link is unknown (already unsubscribed) */
  unsubscribe(token: string, now: number): Subscriber | undefined {
    const s = this.byUnsub(token)
    if (!s) return undefined
    this.db.prepare('DELETE FROM subscribers WHERE id = ?').run(s.id)
    this.event('unsub', s.clubs, now)
    return s
  }

  /** Removes what has run out: unconfirmed sign-ups after 7 days (and pending clubs), old limits, sends and events */
  expire(now: number) {
    const gone = this.db.prepare('DELETE FROM subscribers WHERE confirmed IS NULL AND token_at < ?').run(now - PENDING_MS)
    this.db.prepare("UPDATE subscribers SET pending = '[]' WHERE confirmed IS NOT NULL AND pending != '[]' AND token_at < ?").run(now - PENDING_MS)
    this.db.prepare('DELETE FROM confirm_mails WHERE at < ?').run(now - 2 * 86_400_000)
    this.db.prepare('DELETE FROM sends WHERE at < ?').run(now - 120 * 86_400_000)
    this.db.prepare('DELETE FROM events WHERE at < ?').run(now - 400 * 86_400_000)
    return Number(gone.changes)
  }

  /** Confirmed subscribers (confirmed before `cutoff`) who have not had this week's mail */
  due(week: string, cutoff: number): Subscriber[] {
    return this.db
      .prepare("SELECT * FROM subscribers WHERE confirmed IS NOT NULL AND confirmed <= ? AND clubs != '[]' AND id NOT IN (SELECT sub FROM sends WHERE week = ?) ORDER BY id")
      .all(cutoff, week)
      .map(toSub)
  }

  /** Takes this week's mail for a subscriber; false when it is already taken (sent, or being sent) */
  claim(id: number, week: string, now: number): boolean {
    return Number(this.db.prepare('INSERT OR IGNORE INTO sends (sub, week, at, ok) VALUES (?, ?, ?, 0)').run(id, week, now).changes) === 1
  }

  /** The mail could not be sent (the server did not answer): it is tried again next run */
  release(id: number, week: string) {
    this.db.prepare('DELETE FROM sends WHERE sub = ? AND week = ? AND ok = 0').run(id, week)
  }

  /** The mail went ('ok'), the server refused the address (removed after MAX_FAILS weeks in a row) or there was nothing to send ('skip') */
  done(id: number, week: string, outcome: 'ok' | 'refused' | 'skip', now: number) {
    this.db.prepare('UPDATE sends SET ok = ?, at = ? WHERE sub = ? AND week = ?').run(outcome === 'ok' ? 1 : outcome === 'refused' ? 2 : 3, now, id, week)
    if (outcome === 'skip') return
    if (outcome === 'ok') {
      this.db.prepare('UPDATE subscribers SET fails = 0 WHERE id = ? AND fails != 0').run(id)
      return
    }
    this.db.prepare('UPDATE subscribers SET fails = fails + 1 WHERE id = ?').run(id)
    const r = this.db.prepare('SELECT fails, clubs FROM subscribers WHERE id = ?').get(id)
    if (r && Number(r.fails) >= MAX_FAILS) {
      this.db.prepare('DELETE FROM subscribers WHERE id = ?').run(id)
      this.event('removed', list(r.clubs), now)
    }
  }

  /** Mails the feature has sent today (Danish day): weekly mails and confirmation mails */
  sentToday(now: number): number {
    const from = danishDayStart(now)
    const weekly = Number(this.db.prepare('SELECT COUNT(*) AS n FROM sends WHERE ok = 1 AND at >= ?').get(from)?.n ?? 0)
    const confirms = Number(this.db.prepare('SELECT COUNT(*) AS n FROM confirm_mails WHERE at >= ?').get(from)?.n ?? 0)
    return weekly + confirms
  }

  /** Weekly mails sent for a week */
  sentInWeek(week: string): number {
    return Number(this.db.prepare('SELECT COUNT(*) AS n FROM sends WHERE ok = 1 AND week = ?').get(week)?.n ?? 0)
  }

  getMeta<T>(key: string): T | undefined {
    const r = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key)
    try {
      return r ? (JSON.parse(String(r.value)) as T) : undefined
    } catch {
      return undefined
    }
  }

  setMeta(key: string, value: unknown) {
    this.db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, JSON.stringify(value))
  }

  /** The admin's numbers: confirmed, pending, per club, and the last 30 days' sign-ups and unsubscriptions */
  stats(now: number) {
    const subs = this.db.prepare('SELECT * FROM subscribers').all().map(toSub)
    const confirmed = subs.filter((s) => s.confirmed !== undefined && s.clubs.length)
    const pending = subs.filter((s) => s.pending.length && now - s.tokenAt <= PENDING_MS)
    const perClub: Record<string, { confirmed: number; pending: number }> = {}
    for (const s of subs) {
      for (const c of s.clubs) (perClub[c] ??= { confirmed: 0, pending: 0 }).confirmed++
      for (const c of s.pending) (perClub[c] ??= { confirmed: 0, pending: 0 }).pending++
    }
    const count = (kind: string, from = 0) => Number(this.db.prepare('SELECT COUNT(*) AS n FROM events WHERE kind = ? AND at >= ?').get(kind, from)?.n ?? 0)
    const month = now - 30 * 86_400_000
    return {
      confirmed: confirmed.length,
      pending: subs.filter((s) => s.confirmed === undefined).length,
      pendingClubs: pending.length,
      unsubscribed: count('unsub'),
      unsubscribed30: count('unsub', month),
      removed: count('removed'),
      signups30: count('signup', month),
      confirms30: count('confirm', month),
      perClub,
    }
  }
}

// ---- The weekly queue ----

export interface RunResult {
  week?: string
  /** Mails sent this run */
  sent: number
  /** Addresses the mail server refused */
  refused: number
  /** Subscribers with nothing to tell this week (no club with a match or a table) */
  skipped: number
  /** Still waiting for this week's mail when the run ended */
  left: number
  stopped?: 'outside' | 'cap' | 'error' | 'done'
  error?: string
}

export interface RunOptions {
  now: () => number
  /** Sends one subscriber's mail: 'ok', 'refused' (the server refused the address) or 'skip' (nothing to send); throws when the server cannot be reached */
  send: (sub: Subscriber, week: string) => Promise<'ok' | 'refused' | 'skip'>
  sleep: (ms: number) => Promise<void>
  /** Mails per day in all (weekly and confirmation mails) */
  cap: number
  /** Kept free under the cap for the day's confirmation mails */
  reserve?: number
  /** Pause between two mails (3 s = 20 a minute) */
  gapMs?: number
}

/**
 * Sends this week's mail to everyone who has not had it, one at a time with a pause, until the day's cap: each
 * subscriber is claimed first (one row per subscriber and week), so a restart or a second process never sends it
 * twice; a mail the server could not take is released and tried at the next run; the run stops at the first such error.
 */
export async function runWeekly(store: KlubmailStore, o: RunOptions): Promise<RunResult> {
  const win = sendWindow(o.now())
  if (!win) return { sent: 0, refused: 0, skipped: 0, left: 0, stopped: 'outside' }
  const res: RunResult = { week: win.week, sent: 0, refused: 0, skipped: 0, left: 0 }
  const queue = store.due(win.week, win.cutoff)
  const limit = o.cap - (o.reserve ?? 0)
  for (let i = 0; i < queue.length; i++) {
    const sub = queue[i]
    if (store.sentToday(o.now()) >= limit) {
      res.stopped = 'cap'
      res.left = queue.length - i
      return res
    }
    if (!store.claim(sub.id, win.week, o.now())) continue
    let outcome: 'ok' | 'refused' | 'skip'
    try {
      outcome = await o.send(sub, win.week)
    } catch (e) {
      store.release(sub.id, win.week)
      res.stopped = 'error'
      res.error = e instanceof Error ? e.message : String(e)
      res.left = queue.length - i
      return res
    }
    // Nothing to tell this week (no club with a match or a table): done, not a mail, and no pause
    store.done(sub.id, win.week, outcome, o.now())
    if (outcome === 'skip') {
      res.skipped++
      continue
    }
    if (outcome === 'ok') res.sent++
    else res.refused++
    if (i < queue.length - 1) await o.sleep(o.gapMs ?? 3_000)
  }
  res.stopped = 'done'
  return res
}
