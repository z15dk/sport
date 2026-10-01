import 'server-only'
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { cacheDir } from './tsdb'
import { isoDate } from './time'
import { findClub } from '../data/matchInsights'
import type { Match } from '../types'

// "Køb billetter": where the tickets for a match are sold. The home club sells
// them (also to the away fans), so a match's link is, in order: an exception for
// the match (another link, or none) → the home club's link → a rule for the
// tournament → none (never a guessed link). Set on /admin/billetter and kept in
// data/tickets.json; the clubs start with the links found on their own sites
// (DEFAULT_CLUB_TICKETS). Every button goes through /billet/klik, which counts
// the click (tickets.db) and sends the visitor on to the ticket shop, with the
// partner code of the shop's domain when one is set.

/** The ticket pages found on the clubs' own sites (October 2026); the uncertain ones are left for the admin */
export const DEFAULT_CLUB_TICKETS: Record<string, string> = {
  // Superliga
  fck: 'https://billet.fck.dk',
  fcm: 'https://billetsalg.fcm.dk',
  bif: 'https://billet.brondby.com',
  agf: 'https://billet.agf.dk',
  fcn: 'https://billet.fcn.dk',
  rfc: 'https://rfc.eventii.dk',
  ob: 'https://ob.eventii.dk',
  sif: 'https://billet.silkeborgif.com',
  vff: 'https://billetter.vff.dk',
  lbk: 'https://lbk.eventii.dk',
  ach: 'https://ach.eventii.dk',
  // 1. division
  vb: 'https://vb.eventii.dk',
  aab: 'https://billet.aabsport.dk',
  fcf: 'https://fcf.eventii.dk',
  efb: 'https://billet.efb.dk',
  hif: 'https://shop.hvidovrefodbold.dk',
  kif: 'https://kif.eventii.dk',
  'hik-ob': 'https://shop.hikfodbold.dk',
  hil: 'https://www.hfelite.dk/billetsalg/',
  vff2: 'https://shop.vendsysselff.dk/billetter',
  ab: 'https://billet.ab.dk',
  // 2. division
  b93: 'https://billet.b93.dk',
  mbk: 'https://boldbillet.dk/show/team/middelfart',
  fcr: 'https://boldbillet.dk/show/team/fc-roskilde',
  nbk: 'https://boldbillet.dk/show/team/naestved-bk',
  fam: 'https://fremadamagerelite.dk/shop/',
  sik: 'https://boldbillet.dk/show/team/skive-ik',
  vsk: 'https://vskaarhus.dk/2-division/billetter/',
  nfc: 'https://nfc.eventii.dk',
  // 3. division
  frem: 'https://boldbillet.dk/show/team/frem',
  fch: 'https://boldbillet.dk/show/team/fc-helsingoer',
  van: 'https://boldbillet.dk/show/team/vanloese-if',
  hb: 'https://boldbillet.dk/show/team/holstebro',
  naes: 'https://billet.eventbilletten.dk/seller/nsby-boldklub-5wkf',
}

export interface TicketConfig {
  /** Club id -> its ticket page; '' = none (also overriding a link found by us) */
  clubs: Record<string, string>
  /** League slug or tournament key (x-…) -> a ticket page for all its matches (when the home club has none) */
  leagues: Record<string, string>
  /** Match slug -> a ticket page for that match only; '' = no button */
  matches: Record<string, string>
  /** A ticket shop's domain -> the partner code added to its links ("ref=matchly") */
  partners: Record<string, string>
}

const file = () => process.env.TICKETS_FILE ?? path.join(/*turbopackIgnore: true*/ cacheDir(), 'data', 'tickets.json')
let cache: { mtime: number; config: TicketConfig } | undefined
const EMPTY: TicketConfig = { clubs: {}, leagues: {}, matches: {}, partners: {} }

export function ticketConfig(): TicketConfig {
  let mtime = 0
  try {
    mtime = statSync(file()).mtimeMs
  } catch {
    // nothing saved yet
  }
  if (cache?.mtime === mtime) return cache.config
  let config = EMPTY
  try {
    if (mtime) {
      const saved = JSON.parse(readFileSync(file(), 'utf8')) as Partial<TicketConfig>
      config = { clubs: saved.clubs ?? {}, leagues: saved.leagues ?? {}, matches: saved.matches ?? {}, partners: saved.partners ?? {} }
    }
  } catch {
    config = EMPTY
  }
  cache = { mtime, config }
  return config
}

/** A link as typed in the admin: https added, only http(s); '' stays '' (none) */
export function cleanTicketUrl(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const t = v.trim()
  if (!t) return ''
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`)
    return /^https?:$/.test(u.protocol) ? u.toString() : undefined
  } catch {
    return undefined
  }
}

export function saveTicketConfig(next: TicketConfig) {
  mkdirSync(path.dirname(file()), { recursive: true })
  writeFileSync(`${file()}.tmp`, JSON.stringify(next, null, 2))
  renameSync(`${file()}.tmp`, file())
  cache = undefined
}

/** The club's ticket page: the admin's, else the one we found; undefined when it has none */
export function clubTicketUrl(clubId: string): string | undefined {
  const c = ticketConfig().clubs
  const url = clubId in c ? c[clubId] : DEFAULT_CLUB_TICKETS[clubId]
  return url || undefined
}

/** The ticket page for a match, while it is still to be played (see the order above) */
export function matchTicketUrl(match: Match): string | undefined {
  if (match.state !== 'upcoming') return undefined
  const cfg = ticketConfig()
  if (match.slug in cfg.matches) return cfg.matches[match.slug] || undefined
  const home = findClub(match.home.name)?.club
  const own = home && clubTicketUrl(home.id)
  if (own) return own
  return (match.leagueSlug && cfg.leagues[match.leagueSlug]) || undefined
}

/** The address with the shop's partner code, when one is set for its domain */
export function withPartnerCode(url: string): string {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    const partners = ticketConfig().partners
    const code = Object.entries(partners).find(([d]) => host === d || host.endsWith(`.${d}`))?.[1]
    if (!code) return url
    for (const [k, v] of new URLSearchParams(code)) u.searchParams.set(k, v)
    return u.toString()
  } catch {
    return url
  }
}

/** Our counting address for the button (the click is counted, then the visitor goes on) */
export const ticketClickPath = (q: { kamp?: string; klub?: string }) => `/billet/klik?${new URLSearchParams(q as Record<string, string>)}`

// ---------------------------------------------------------------- clicks

type Row = Record<string, unknown>
interface Db {
  exec(sql: string): void
  prepare(sql: string): { run(...p: unknown[]): unknown; all(...p: unknown[]): Row[] }
}
interface State {
  db?: Db | null
  queue: Map<string, { day: string; club: string; match: string; clicks: number }>
  timer?: ReturnType<typeof setTimeout>
}
const holder = globalThis as typeof globalThis & { __scorelineTicketStats?: State }
const state: State = (holder.__scorelineTicketStats ??= { queue: new Map() })
const dbFile = () => process.env.TICKETS_DB ?? path.join(/*turbopackIgnore: true*/ cacheDir(), 'data', 'tickets.db')

function db(): Db | undefined {
  if (state.db !== undefined) return state.db ?? undefined
  try {
    const sqlite = process.getBuiltinModule?.('node:sqlite') as { DatabaseSync: new (f: string) => Db } | undefined
    if (!sqlite) {
      state.db = null
      return undefined
    }
    mkdirSync(path.dirname(dbFile()), { recursive: true })
    const d = new sqlite.DatabaseSync(dbFile())
    d.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000')
    d.exec('CREATE TABLE IF NOT EXISTS clicks (day TEXT, club TEXT, match TEXT, clicks INTEGER, PRIMARY KEY (day, club, match))')
    state.db = d
    return d
  } catch {
    state.db = null
    return undefined
  }
}

const ROBOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|facebookexternalhit|curl|wget|python/i

/** One click on a ticket button (robots not counted); written five seconds at a time */
export function noteTicketClick(club: string, match: string, ua: string | null) {
  if (!ua || ROBOT.test(ua)) return
  const day = isoDate(Date.now())
  const key = `${day}|${club}|${match}`
  const row = state.queue.get(key) ?? { day, club, match, clicks: 0 }
  row.clicks++
  state.queue.set(key, row)
  state.timer ??= setTimeout(flush, 5_000)
  state.timer.unref?.()
}

function flush() {
  state.timer = undefined
  const d = db()
  const rows = [...state.queue.values()]
  state.queue.clear()
  if (!d || !rows.length) return
  try {
    const up = d.prepare('INSERT INTO clicks (day, club, match, clicks) VALUES (?, ?, ?, ?) ON CONFLICT (day, club, match) DO UPDATE SET clicks = clicks + excluded.clicks')
    d.exec('BEGIN')
    for (const r of rows) up.run(r.day, r.club, r.match, r.clicks)
    d.exec('COMMIT')
  } catch {
    try {
      d.exec('ROLLBACK')
    } catch {
      // nothing begun
    }
  }
}

/** The clicks for /admin/billetter: per day (30 days), per club and the matches with most */
export function ticketStats() {
  flush()
  const d = db()
  if (!d) return undefined
  const from = isoDate(Date.now() - 29 * 86_400_000)
  const days = d.prepare('SELECT day, SUM(clicks) AS n FROM clicks WHERE day >= ? GROUP BY day ORDER BY day').all(from).map((r) => ({ day: String(r.day), clicks: Number(r.n) }))
  const clubs = d.prepare('SELECT club, SUM(clicks) AS n FROM clicks WHERE day >= ? GROUP BY club ORDER BY n DESC').all(from).map((r) => ({ club: String(r.club), clicks: Number(r.n) }))
  const matches = d
    .prepare("SELECT match, club, SUM(clicks) AS n FROM clicks WHERE day >= ? AND match != '' GROUP BY match ORDER BY n DESC LIMIT 15")
    .all(from)
    .map((r) => ({ match: String(r.match), club: String(r.club), clicks: Number(r.n) }))
  const total = days.reduce((n, x) => n + x.clicks, 0)
  return { days, clubs, matches, total }
}
