import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { cacheDir } from './tsdb'
import { isoDate } from './time'

// Our own visitor statistics, without cookies (the way Plausible counts): a
// page view is sent by the page itself (src/components/VisitBeacon.tsx, so
// search engines and other robots are not counted), and a visitor is known
// only within one day by a hash of a secret that changes every night, the IP
// address and the browser – the address itself is never saved, and the day's
// secret is forgotten, so no one can be followed from one day to the next.
// Saved in SQLite (analytics.db, ANALYTICS_DB): every view for 35 days, and
// numbers per day for good. Written five seconds at a time, so no page waits.

type Row = Record<string, unknown>
interface Stmt {
  run(...p: unknown[]): unknown
  all(...p: unknown[]): Row[]
  get(...p: unknown[]): Row | undefined
}
interface Db {
  exec(sql: string): void
  prepare(sql: string): Stmt
}

const file = () => process.env.ANALYTICS_DB ?? path.join(/*turbopackIgnore: true*/ cacheDir(), 'data', 'analytics.db')

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS views (ts INTEGER, day TEXT, path TEXT, visitor TEXT, ref TEXT, device TEXT, first INTEGER);
  CREATE INDEX IF NOT EXISTS views_day ON views (day);
  CREATE INDEX IF NOT EXISTS views_ts ON views (ts);
  CREATE TABLE IF NOT EXISTS days (day TEXT PRIMARY KEY, visitors INTEGER, views INTEGER);
`

interface State {
  db?: Db | null
  queue: unknown[][]
  salt: { day: string; value: Buffer }
  timer?: ReturnType<typeof setTimeout>
  prunedDay?: string
}
const holder = globalThis as typeof globalThis & { __scorelineVisits?: State }
const state = (holder.__scorelineVisits ??= { queue: [], salt: { day: '', value: randomBytes(32) } })

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
    d.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000; PRAGMA synchronous = NORMAL')
    d.exec(SCHEMA)
    state.db = d
    return d
  } catch {
    state.db = null
    return undefined
  }
}

/** Robots, previews and tools that run the page's script too */
const ROBOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|facebookexternalhit|embedly|quora|whatsapp|telegram|curl|wget|python|axios|node-fetch|playwright|puppeteer|phantom/i

const deviceOf = (ua: string) => (/ipad|tablet|(android(?!.*mobile))/i.test(ua) ? 'tablet' : /mobi|iphone|android/i.test(ua) ? 'mobil' : 'computer')

/** Where the visitor came from: the other site's name (our own site and none: direct) */
function referrerOf(ref: string | undefined, host: string | undefined): string {
  if (!ref) return ''
  try {
    const h = new URL(ref).hostname.replace(/^www\./, '').toLowerCase()
    if (!h || (host && h === host.replace(/^www\./, '').split(':')[0])) return ''
    if (/(^|\.)google\./.test(h)) return 'Google'
    if (/(^|\.)bing\.com$/.test(h)) return 'Bing'
    if (/duckduckgo\.com$/.test(h)) return 'DuckDuckGo'
    if (/(^|\.)(facebook\.com|fb\.com|fb\.me)$/.test(h) || h === 'l.facebook.com' || h === 'lm.facebook.com') return 'Facebook'
    if (/instagram\.com$/.test(h)) return 'Instagram'
    if (/threads\.(net|com)$/.test(h)) return 'Threads'
    if (/(^|\.)(x\.com|twitter\.com|t\.co)$/.test(h)) return 'X'
    if (/reddit\.com$/.test(h)) return 'Reddit'
    return h.slice(0, 80)
  } catch {
    return ''
  }
}

/** Notes one page view (the page's own request); nothing for robots, the admin pages or the redaction */
export function recordView(input: { path: unknown; ref: unknown; ip: string; ua: string; host?: string; admin: boolean }) {
  if (input.admin || !input.ua || ROBOT.test(input.ua)) return
  const p = typeof input.path === 'string' ? input.path.split('?')[0].slice(0, 200) : ''
  if (!p.startsWith('/') || p.startsWith('/admin') || p.startsWith('/api')) return
  const now = Date.now()
  const day = isoDate(now)
  // A new secret every day; yesterday's is forgotten
  if (state.salt.day !== day) state.salt = { day, value: randomBytes(32) }
  const visitor = createHash('sha256').update(state.salt.value).update(input.ip).update('|').update(input.ua).digest('hex').slice(0, 16)
  state.queue.push([now, day, p, visitor, referrerOf(typeof input.ref === 'string' ? input.ref : undefined, input.host), deviceOf(input.ua)])
  if (state.queue.length > 5_000) state.queue.splice(0, state.queue.length - 5_000)
  state.timer ??= setTimeout(flush, 5_000)
  state.timer.unref?.()
}

function flush() {
  state.timer = undefined
  const d = db()
  const rows = state.queue.splice(0)
  if (!d || !rows.length) return
  try {
    const seen = d.prepare('SELECT 1 FROM views WHERE day = ? AND visitor = ? LIMIT 1')
    const add = d.prepare('INSERT INTO views (ts, day, path, visitor, ref, device, first) VALUES (?, ?, ?, ?, ?, ?, ?)')
    d.exec('BEGIN')
    const firstNow = new Set<string>()
    for (const [ts, day, p, visitor, ref, device] of rows) {
      const key = `${day}|${visitor}`
      const first = !firstNow.has(key) && !seen.get(day, visitor)
      if (first) firstNow.add(key)
      add.run(ts, day, p, visitor, ref, device, first ? 1 : 0)
    }
    d.exec('COMMIT')
    prune(d)
  } catch {
    try {
      d.exec('ROLLBACK')
    } catch {
      // nothing begun
    }
  }
}

/** Once a day: the finished days summed up for good, views older than 35 days deleted */
function prune(d: Db) {
  const today = isoDate(Date.now())
  if (state.prunedDay === today) return
  state.prunedDay = today
  d.exec(`INSERT OR REPLACE INTO days (day, visitors, views)
            SELECT day, COUNT(DISTINCT visitor), COUNT(*) FROM views WHERE day < '${today}' GROUP BY day`)
  d.prepare('DELETE FROM views WHERE ts < ?').run(Date.now() - 35 * 86_400_000)
}

export interface VisitStats {
  today: { visitors: number; views: number }
  yesterday: { visitors: number; views: number }
  now: number
  days: { day: string; visitors: number; views: number }[]
  hours: number[]
  pages: { path: string; views: number; visitors: number }[]
  refs: { ref: string; visitors: number }[]
  devices: { device: string; visitors: number }[]
  week: { visitors: number; views: number }
}

export interface PathStat {
  views: number
  visitors: number
  today: number
  week: number
  /** Visits that came by a link from another site (search engines and social media not counted), per site */
  refs: { site: string; visits: number }[]
}

/** Views of a few pages in the last `days` days (the views table keeps 35): views, visitors, today and the last 7 days, and the visits that came by a link from another site */
export function pathStats(paths: string[], days = 35): Map<string, PathStat> {
  const out = new Map<string, PathStat>()
  flush()
  const d = db()
  if (!d || !paths.length) return out
  const now = Date.now()
  const from = isoDate(now - (days - 1) * 86_400_000)
  const today = isoDate(now)
  const weekFrom = isoDate(now - 6 * 86_400_000)
  const marks = paths.map(() => '?').join(',')
  const get = (p: string) => out.get(p) ?? out.set(p, { views: 0, visitors: 0, today: 0, week: 0, refs: [] }).get(p)!
  for (const r of d.prepare(`SELECT path, COUNT(*) AS n, COUNT(DISTINCT day || visitor) AS v, SUM(CASE WHEN day = ? THEN 1 ELSE 0 END) AS t, SUM(CASE WHEN day >= ? THEN 1 ELSE 0 END) AS w FROM views WHERE day >= ? AND path IN (${marks}) GROUP BY path`).all(today, weekFrom, from, ...paths)) {
    const e = get(String(r.path))
    e.views = Number(r.n)
    e.visitors = Number(r.v)
    e.today = Number(r.t)
    e.week = Number(r.w)
  }
  const known = new Set(['Google', 'Bing', 'DuckDuckGo', 'Facebook', 'Instagram', 'Threads', 'X', 'Reddit'])
  for (const r of d.prepare(`SELECT path, ref, COUNT(*) AS n FROM views WHERE day >= ? AND first = 1 AND ref != '' AND path IN (${marks}) GROUP BY path, ref ORDER BY n DESC`).all(from, ...paths)) {
    if (known.has(String(r.ref))) continue
    get(String(r.path)).refs.push({ site: String(r.ref), visits: Number(r.n) })
  }
  return out
}

/** The numbers for /admin/besoegende; `range` days for the pages, sources and devices */
export function visitStats(range = 1): VisitStats | undefined {
  flush()
  const d = db()
  if (!d) return undefined
  const now = Date.now()
  const today = isoDate(now)
  const from = isoDate(now - (range - 1) * 86_400_000)
  const one = (day: string) => {
    const r = d.prepare('SELECT COUNT(DISTINCT visitor) AS v, COUNT(*) AS n FROM views WHERE day = ?').get(day)
    const saved = d.prepare('SELECT visitors AS v, views AS n FROM days WHERE day = ?').get(day)
    const x = r && Number(r.n) ? r : saved
    return { visitors: Number(x?.v ?? 0), views: Number(x?.n ?? 0) }
  }
  const byDay = new Map<string, { visitors: number; views: number }>()
  for (const r of d.prepare('SELECT day, visitors AS v, views AS n FROM days ORDER BY day DESC LIMIT 60').all()) byDay.set(String(r.day), { visitors: Number(r.v), views: Number(r.n) })
  for (const r of d.prepare('SELECT day, COUNT(DISTINCT visitor) AS v, COUNT(*) AS n FROM views WHERE ts > ? GROUP BY day').all(now - 35 * 86_400_000))
    byDay.set(String(r.day), { visitors: Number(r.v), views: Number(r.n) })
  const days = Array.from({ length: 30 }, (_, i) => {
    const day = isoDate(now - (29 - i) * 86_400_000)
    return { day, ...(byDay.get(day) ?? { visitors: 0, views: 0 }) }
  })
  const hours = Array(24).fill(0) as number[]
  for (const r of d.prepare('SELECT ts FROM views WHERE day = ? AND first = 1').all(today)) {
    const h = Number(new Intl.DateTimeFormat('da-DK', { timeZone: 'Europe/Copenhagen', hour: '2-digit', hourCycle: 'h23' }).format(new Date(Number(r.ts))))
    hours[h]++
  }
  const week = d.prepare('SELECT COUNT(DISTINCT day || visitor) AS v, COUNT(*) AS n FROM views WHERE day >= ?').get(isoDate(now - 6 * 86_400_000))
  return {
    today: one(today),
    yesterday: one(isoDate(now - 86_400_000)),
    now: Number(d.prepare('SELECT COUNT(DISTINCT visitor) AS v FROM views WHERE ts > ?').get(now - 5 * 60_000)?.v ?? 0),
    days,
    hours,
    pages: d
      .prepare('SELECT path, COUNT(*) AS n, COUNT(DISTINCT visitor) AS v FROM views WHERE day >= ? GROUP BY path ORDER BY n DESC LIMIT 15')
      .all(from)
      .map((r) => ({ path: String(r.path), views: Number(r.n), visitors: Number(r.v) })),
    refs: d
      .prepare("SELECT CASE WHEN ref = '' THEN 'Direkte / ukendt' ELSE ref END AS ref, COUNT(DISTINCT day || visitor) AS v FROM views WHERE day >= ? AND first = 1 GROUP BY 1 ORDER BY v DESC LIMIT 10")
      .all(from)
      .map((r) => ({ ref: String(r.ref), visitors: Number(r.v) })),
    devices: d
      .prepare('SELECT device, COUNT(DISTINCT day || visitor) AS v FROM views WHERE day >= ? AND first = 1 GROUP BY device ORDER BY v DESC')
      .all(from)
      .map((r) => ({ device: String(r.device), visitors: Number(r.v) })),
    week: { visitors: Number(week?.v ?? 0), views: Number(week?.n ?? 0) },
  }
}
