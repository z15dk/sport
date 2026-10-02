import 'server-only'
import { isoDate } from './time'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { cacheDir } from './tsdb'

// Matchly's own ticket shop (the product we sell to clubs, /billetsystem). For
// now a demo that works end to end on real matches from our fixture list: a
// buyer picks tickets (no money is taken), gets tickets with QR codes, the gate
// scans them on a phone (/billetsystem/demo/scanner) and the club follows the
// sales live. Everything is marked "Demo" and deleted after three days. Kept in
// SQLite billetsalg.db in the shop's own folder (TICKET_SHOP_DIR); a ticket's QR code is its id signed
// with the shop's secret (so a code can't be made up), checked when scanned.

export interface TicketType {
  id: string
  label: string
  price: number
}

/** The demo's ticket types (a club sets its own) */
export const DEMO_TYPES: TicketType[] = [
  { id: 'voksen', label: 'Voksen', price: 80 },
  { id: 'pensionist', label: 'Pensionist / studerende', price: 40 },
  { id: 'barn', label: 'Barn under 18 år', price: 0 },
]

/** The buyer's fee per paid ticket: 5 kr. + 3 % (free tickets cost nothing); the club gets the whole ticket price */
export const feeFor = (price: number) => (price > 0 ? Math.round((5 + price * 0.03) * 100) / 100 : 0)

type Row = Record<string, unknown>
interface Db {
  exec(sql: string): void
  prepare(sql: string): { run(...p: unknown[]): { changes?: number | bigint }; all(...p: unknown[]): Row[]; get(...p: unknown[]): Row | undefined }
}

// Everything the ticket shop keeps is in one folder (TICKET_SHOP_DIR): the database and the signing secret.
// Moving the shop to another server = copying this folder and setting the same variable there (docs/billetsystem.md).
const dir = () => process.env.TICKET_SHOP_DIR ?? path.join(/*turbopackIgnore: true*/ cacheDir(), 'data', 'billetsalg')
const file = () => path.join(dir(), 'billetsalg.db')
const holder = globalThis as typeof globalThis & { __scorelineTicketShop?: { db?: Db | null; secret?: Buffer; cleaned?: number } }
const state = (holder.__scorelineTicketShop ??= {})

function db(): Db | undefined {
  if (state.db !== undefined) return state.db ?? undefined
  try {
    const sqlite = process.getBuiltinModule?.('node:sqlite') as { DatabaseSync: new (f: string) => Db } | undefined
    if (!sqlite) {
      state.db = null
      return undefined
    }
    mkdirSync(path.dirname(file()), { recursive: true })
    const d = new sqlite.DatabaseSync(file())
    d.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000')
    d.exec(`
      CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, created INTEGER, match TEXT, title TEXT, kickoff INTEGER, venue TEXT, club TEXT, name TEXT, email TEXT, total REAL, fee REAL, demo INTEGER);
      CREATE INDEX IF NOT EXISTS orders_match ON orders (match);
      CREATE TABLE IF NOT EXISTS tickets (id TEXT PRIMARY KEY, order_id TEXT, match TEXT, type TEXT, label TEXT, price REAL, used_at INTEGER);
      CREATE INDEX IF NOT EXISTS tickets_order ON tickets (order_id);
      CREATE INDEX IF NOT EXISTS tickets_match ON tickets (match);
      CREATE TABLE IF NOT EXISTS leads (id INTEGER PRIMARY KEY AUTOINCREMENT, created INTEGER, club TEXT, name TEXT, email TEXT, phone TEXT, message TEXT);
    `)
    // What the lead is about: the ticket system (the default, older rows) or advertising on Matchly (/annoncering)
    const cols = d.prepare('PRAGMA table_info(leads)').all().map((c) => String(c.name))
    if (!cols.includes('kind')) d.exec("ALTER TABLE leads ADD COLUMN kind TEXT NOT NULL DEFAULT 'billet'")
    state.db = d
    return d
  } catch {
    state.db = null
    return undefined
  }
}

/** The shop's own secret for signing the QR codes (made once, kept beside the database) */
function secret(): Buffer {
  if (state.secret) return state.secret
  // TICKET_SHOP_SECRET (hex) wins, so several servers can share it; else the file in the shop's folder
  if (process.env.TICKET_SHOP_SECRET && /^[0-9a-f]{32,}$/i.test(process.env.TICKET_SHOP_SECRET)) return (state.secret = Buffer.from(process.env.TICKET_SHOP_SECRET, 'hex'))
  const f = path.join(dir(), 'billetsalg.secret')
  try {
    if (existsSync(f)) state.secret = Buffer.from(readFileSync(f, 'utf8').trim(), 'hex')
  } catch {
    // made anew below
  }
  if (!state.secret || state.secret.length < 16) {
    state.secret = randomBytes(32)
    try {
      mkdirSync(path.dirname(f), { recursive: true })
      writeFileSync(f, state.secret.toString('hex'), { mode: 0o600 })
    } catch {
      // kept in memory: codes stay valid until the server restarts
    }
  }
  return state.secret
}

const sign = (id: string) => createHmac('sha256', secret()).update(id).digest('base64url').slice(0, 10)
/** The text in a ticket's QR code */
export const ticketCode = (id: string) => `MTK1.${id}.${sign(id)}`
const newId = (n = 12) => randomBytes(n).toString('base64url').replace(/[-_]/g, '').slice(0, n)

/** Demo orders go after three days */
function clean(d: Db) {
  if (Date.now() - (state.cleaned ?? 0) < 3_600_000) return
  state.cleaned = Date.now()
  const before = Date.now() - 3 * 86_400_000
  d.prepare('DELETE FROM tickets WHERE order_id IN (SELECT id FROM orders WHERE demo = 1 AND created < ?)').run(before)
  d.prepare('DELETE FROM orders WHERE demo = 1 AND created < ?').run(before)
}

export interface OrderInput {
  match: { slug: string; title: string; kickoff: number; venue?: string; club: string }
  quantities: Record<string, number>
  name?: string
  email?: string
}

/** A demo order: the tickets made, no money taken */
export function createDemoOrder(input: OrderInput): { id: string } | { error: string } {
  const d = db()
  if (!d) return { error: 'Billetsalget er ikke tilgængeligt lige nu' }
  clean(d)
  const lines = DEMO_TYPES.flatMap((t) => {
    const n = Math.max(0, Math.min(20, Math.floor(Number(input.quantities[t.id] ?? 0)) || 0))
    return Array.from({ length: n }, () => t)
  })
  if (!lines.length) return { error: 'Vælg mindst én billet' }
  // A cap on the demo, so nobody can fill the database
  const today = Number(d.prepare('SELECT COUNT(*) AS n FROM orders WHERE demo = 1 AND created > ?').get(Date.now() - 86_400_000)?.n ?? 0)
  if (today > 5000) return { error: 'Demoen har nået dagens grænse – prøv igen i morgen' }
  const id = newId(16)
  const total = lines.reduce((n, t) => n + t.price, 0)
  const fee = Math.round(lines.reduce((n, t) => n + feeFor(t.price), 0) * 100) / 100
  const name = (input.name ?? '').trim().slice(0, 80)
  const email = (input.email ?? '').trim().slice(0, 120)
  d.exec('BEGIN')
  try {
    d.prepare('INSERT INTO orders (id, created, match, title, kickoff, venue, club, name, email, total, fee, demo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)').run(
      id,
      Date.now(),
      input.match.slug,
      input.match.title,
      input.match.kickoff,
      input.match.venue ?? '',
      input.match.club,
      name,
      email,
      total,
      fee,
    )
    const add = d.prepare('INSERT INTO tickets (id, order_id, match, type, label, price, used_at) VALUES (?, ?, ?, ?, ?, ?, NULL)')
    for (const t of lines) add.run(newId(12), id, input.match.slug, t.id, t.label, t.price)
    d.exec('COMMIT')
  } catch {
    d.exec('ROLLBACK')
    return { error: 'Det gik ikke – prøv igen' }
  }
  return { id }
}

export interface Order {
  id: string
  created: number
  match: string
  title: string
  kickoff: number
  venue: string
  club: string
  name: string
  total: number
  fee: number
  demo: boolean
  tickets: { id: string; type: string; label: string; price: number; usedAt?: number; code: string }[]
}

export function order(id: string): Order | undefined {
  const d = db()
  if (!d || !/^[A-Za-z0-9]{8,32}$/.test(id)) return undefined
  const o = d.prepare('SELECT * FROM orders WHERE id = ?').get(id)
  if (!o) return undefined
  const tickets = d
    .prepare('SELECT * FROM tickets WHERE order_id = ? ORDER BY price DESC, id')
    .all(id)
    .map((t) => ({ id: String(t.id), type: String(t.type), label: String(t.label), price: Number(t.price), usedAt: t.used_at ? Number(t.used_at) : undefined, code: ticketCode(String(t.id)) }))
  return {
    id,
    created: Number(o.created),
    match: String(o.match),
    title: String(o.title),
    kickoff: Number(o.kickoff),
    venue: String(o.venue ?? ''),
    club: String(o.club),
    name: String(o.name ?? ''),
    total: Number(o.total),
    fee: Number(o.fee),
    demo: Number(o.demo) === 1,
    tickets,
  }
}

/** Where the ticket sits in its order (no. 5 of 17) and how many of the order are in now */
interface Group {
  no: number
  of: number
  inside: number
}

export type ScanResult =
  | ({ status: 'ok'; label: string; title: string; match: string } & Group)
  | ({ status: 'used'; label: string; title: string; usedAt: number; match: string } & Group)
  | { status: 'wrong-match'; label: string; title: string }
  | { status: 'invalid' }

/** A code at the gate: valid (and now used), used before, for another match, or not one of ours */
export function scanTicket(code: string, match?: string): ScanResult {
  const d = db()
  const m = /^MTK1\.([A-Za-z0-9]{8,32})\.([A-Za-z0-9_-]{10})$/.exec(code.trim())
  if (!d || !m) return { status: 'invalid' }
  const [, id, sig] = m
  const want = Buffer.from(sign(id))
  if (want.length !== Buffer.from(sig).length || !timingSafeEqual(want, Buffer.from(sig))) return { status: 'invalid' }
  const t = d.prepare('SELECT t.*, o.title FROM tickets t JOIN orders o ON o.id = t.order_id WHERE t.id = ?').get(id)
  if (!t) return { status: 'invalid' }
  const label = String(t.label)
  const title = String(t.title)
  if (match && String(t.match) !== match) return { status: 'wrong-match', label, title }
  // Marked used only if it wasn't already (two scanners at once can't both let it in)
  const changed = Number(d.prepare('UPDATE tickets SET used_at = ? WHERE id = ? AND used_at IS NULL').run(Date.now(), id).changes ?? 0)
  const g = d
    // Numbered as on the order page (price, then id)
    .prepare('SELECT SUM(CASE WHEN price > ? OR (price = ? AND id <= ?) THEN 1 ELSE 0 END) AS no, COUNT(*) AS n, SUM(CASE WHEN used_at IS NOT NULL THEN 1 ELSE 0 END) AS inside FROM tickets WHERE order_id = ?')
    .get(t.price, t.price, id, t.order_id)
  const group: Group = { no: Number(g?.no ?? 1), of: Number(g?.n ?? 1), inside: Number(g?.inside ?? 0) }
  if (changed) return { status: 'ok', label, title, match: String(t.match), ...group }
  const again = d.prepare('SELECT used_at FROM tickets WHERE id = ?').get(id)
  return { status: 'used', label, title, usedAt: Number(again?.used_at ?? 0), match: String(t.match), ...group }
}

/** The club's view of a match: sold per type, money for the club, our fee, scanned, the latest orders */
export function matchSales(match: string) {
  const d = db()
  if (!d) return undefined
  const types = d
    .prepare('SELECT type, label, price, COUNT(*) AS n, SUM(CASE WHEN used_at IS NOT NULL THEN 1 ELSE 0 END) AS used FROM tickets WHERE match = ? GROUP BY type ORDER BY price DESC')
    .all(match)
    .map((r) => ({ type: String(r.type), label: String(r.label), price: Number(r.price), sold: Number(r.n), used: Number(r.used) }))
  const o = d.prepare('SELECT COUNT(*) AS n, SUM(total) AS total, SUM(fee) AS fee FROM orders WHERE match = ?').get(match)
  const latest = d
    .prepare('SELECT o.id, o.created, o.name, o.total, COUNT(t.id) AS n FROM orders o JOIN tickets t ON t.order_id = o.id WHERE o.match = ? GROUP BY o.id ORDER BY o.created DESC LIMIT 12')
    .all(match)
    .map((r) => ({ id: String(r.id), created: Number(r.created), name: String(r.name ?? ''), total: Number(r.total), tickets: Number(r.n) }))
  const sold = types.reduce((n, t) => n + t.sold, 0)
  const used = types.reduce((n, t) => n + t.used, 0)
  return { types, orders: Number(o?.n ?? 0), revenue: Number(o?.total ?? 0), fee: Number(o?.fee ?? 0), sold, used, latest }
}

/** A match's sales inside the club's overview */
export interface ClubMatchSales {
  match: string
  title: string
  kickoff: number
  orders: number
  sold: number
  used: number
  revenue: number
}

export interface ClubSales {
  orders: number
  sold: number
  used: number
  revenue: number
  fee: number
  matches: ClubMatchSales[]
  /** The last 14 days, oldest first (Danish dates) */
  days: { day: string; sold: number; revenue: number }[]
  types: { type: string; label: string; price: number; sold: number; used: number }[]
  latest: { id: string; created: number; name: string; total: number; tickets: number; title: string; match: string }[]
}

const DASH_DAYS = 14

/** The club's overview across all its matches (/billetsystem/demo/salg/<klub>): totals, per match, per day, per type, the latest orders */
export function clubSales(club: string): ClubSales | undefined {
  const d = db()
  if (!d || !club) return undefined
  const matches = d
    .prepare(
      'SELECT o.match, o.title, o.kickoff, COUNT(DISTINCT o.id) AS orders, COUNT(t.id) AS sold, SUM(CASE WHEN t.used_at IS NOT NULL THEN 1 ELSE 0 END) AS used, SUM(t.price) AS revenue FROM orders o JOIN tickets t ON t.order_id = o.id WHERE o.club = ? GROUP BY o.match ORDER BY o.kickoff',
    )
    .all(club)
    .map((r) => ({ match: String(r.match), title: String(r.title), kickoff: Number(r.kickoff), orders: Number(r.orders), sold: Number(r.sold), used: Number(r.used), revenue: Number(r.revenue ?? 0) }))
  const types = d
    .prepare(
      'SELECT t.type, t.label, t.price, COUNT(*) AS n, SUM(CASE WHEN t.used_at IS NOT NULL THEN 1 ELSE 0 END) AS used FROM tickets t JOIN orders o ON o.id = t.order_id WHERE o.club = ? GROUP BY t.type ORDER BY t.price DESC',
    )
    .all(club)
    .map((r) => ({ type: String(r.type), label: String(r.label), price: Number(r.price), sold: Number(r.n), used: Number(r.used) }))
  const o = d.prepare('SELECT COUNT(*) AS n, SUM(total) AS total, SUM(fee) AS fee FROM orders WHERE club = ?').get(club)
  const latest = d
    .prepare('SELECT o.id, o.created, o.name, o.total, o.title, o.match, COUNT(t.id) AS n FROM orders o JOIN tickets t ON t.order_id = o.id WHERE o.club = ? GROUP BY o.id ORDER BY o.created DESC LIMIT 12')
    .all(club)
    .map((r) => ({ id: String(r.id), created: Number(r.created), name: String(r.name ?? ''), total: Number(r.total), tickets: Number(r.n), title: String(r.title), match: String(r.match) }))
  // Sold per day (Danish dates), the last two weeks
  const now = Date.now()
  const byDay = new Map<string, { sold: number; revenue: number }>()
  for (let i = DASH_DAYS - 1; i >= 0; i--) byDay.set(isoDate(now - i * 86_400_000), { sold: 0, revenue: 0 })
  for (const r of d
    .prepare('SELECT o.created, COUNT(t.id) AS n, SUM(t.price) AS revenue FROM orders o JOIN tickets t ON t.order_id = o.id WHERE o.club = ? AND o.created > ? GROUP BY o.id')
    .all(club, now - DASH_DAYS * 86_400_000)) {
    const day = byDay.get(isoDate(Number(r.created)))
    if (day) {
      day.sold += Number(r.n)
      day.revenue += Number(r.revenue ?? 0)
    }
  }
  return {
    orders: Number(o?.n ?? 0),
    sold: types.reduce((n, t) => n + t.sold, 0),
    used: types.reduce((n, t) => n + t.used, 0),
    revenue: Number(o?.total ?? 0),
    fee: Number(o?.fee ?? 0),
    matches,
    days: [...byDay].map(([day, v]) => ({ day, ...v })),
    types,
    latest,
  }
}

/** Tickets sold and money per club, for the list of clubs in the demo */
export function soldByClub(): Map<string, { sold: number; revenue: number }> {
  const d = db()
  const out = new Map<string, { sold: number; revenue: number }>()
  if (!d) return out
  for (const r of d.prepare("SELECT o.club, COUNT(t.id) AS n, SUM(t.price) AS revenue FROM orders o JOIN tickets t ON t.order_id = o.id WHERE o.club != '' GROUP BY o.club").all())
    out.set(String(r.club), { sold: Number(r.n), revenue: Number(r.revenue ?? 0) })
  return out
}

export type LeadKind = 'billet' | 'annoncering'

/** A club that wants to hear more (the form on /billetsystem), or an advertiser (the form on /annoncering) */
export function saveLead(input: { club: string; name: string; email: string; phone: string; message: string }, kind: LeadKind = 'billet'): { ok: true } | { error: string } {
  const d = db()
  if (!d) return { error: 'Det gik ikke – prøv igen senere' }
  const clip = (s: string, n: number) => s.trim().slice(0, n)
  const club = clip(input.club, 120)
  const email = clip(input.email, 160)
  if (!club || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: kind === 'annoncering' ? 'Skriv virksomhedens navn og en mailadresse' : 'Skriv klubbens navn og en mailadresse' }
  const recent = Number(d.prepare('SELECT COUNT(*) AS n FROM leads WHERE created > ?').get(Date.now() - 3_600_000)?.n ?? 0)
  if (recent > 30) return { error: 'For mange henvendelser lige nu – prøv igen om lidt' }
  d.prepare('INSERT INTO leads (created, club, name, email, phone, message, kind) VALUES (?, ?, ?, ?, ?, ?, ?)').run(Date.now(), club, clip(input.name, 120), email, clip(input.phone, 40), clip(input.message, 2000), kind)
  return { ok: true }
}

export function leads(kind: LeadKind = 'billet') {
  const d = db()
  if (!d) return []
  return d
    .prepare('SELECT * FROM leads WHERE kind = ? ORDER BY created DESC LIMIT 200')
    .all(kind)
    .map((r) => ({ id: Number(r.id), created: Number(r.created), club: String(r.club), name: String(r.name ?? ''), email: String(r.email), phone: String(r.phone ?? ''), message: String(r.message ?? '') }))
}
