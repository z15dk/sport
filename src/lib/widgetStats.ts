import 'server-only'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { cacheDir } from './tsdb'
import { isoDate } from './time'
import { SITE_URL } from './site'

// Who uses the league table widget (/widget): every time a page shows it,
// public/widget.js tells the table which page it sits on and whether the link
// back to us is still there. Counted per day, site, page, league and team in
// SQLite (widget.db, WIDGET_DB) and shown on /admin/widget. Only the other
// site's address is kept – nothing about its visitors. Written five seconds at
// a time; a browser keeps the table five minutes, so the views are a floor.

type Row = Record<string, unknown>
interface Db {
  exec(sql: string): void
  prepare(sql: string): { run(...p: unknown[]): unknown; all(...p: unknown[]): Row[] }
}

const file = () => process.env.WIDGET_DB ?? path.join(/*turbopackIgnore: true*/ cacheDir(), 'data', 'widget.db')

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS hits (
    day TEXT, domain TEXT, page TEXT, liga TEXT, hold TEXT, link INTEGER, views INTEGER, first_ts INTEGER, last_ts INTEGER,
    PRIMARY KEY (day, domain, page, liga, hold)
  );
  CREATE INDEX IF NOT EXISTS hits_domain ON hits (domain);
`

interface State {
  db?: Db | null
  queue: Map<string, { day: string; domain: string; page: string; liga: string; hold: string; link: number; views: number; ts: number }>
  timer?: ReturnType<typeof setTimeout>
}
const holder = globalThis as typeof globalThis & { __scorelineWidgetStats?: State }
const state: State = (holder.__scorelineWidgetStats ??= { queue: new Map() })

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

const ROBOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|pagespeed|curl|wget|python|playwright|puppeteer/i
const ourHost = () => {
  try {
    return new URL(SITE_URL).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** One showing of the table on another site (our own pages, previews and robots are not counted) */
export function noteWidgetView(input: { page?: string | null; referer?: string | null; liga: string; hold?: string | null; link?: string | null; ua?: string | null; preview?: boolean }) {
  if (input.preview || ROBOT.test(input.ua ?? '')) return
  let url: URL
  try {
    url = new URL(input.page || input.referer || '')
  } catch {
    return
  }
  if (!/^https?:$/.test(url.protocol)) return
  const domain = url.hostname.replace(/^www\./, '').toLowerCase()
  if (!domain || domain === ourHost() || domain === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(domain)) return
  const page = `${url.origin}${url.pathname}`.slice(0, 300)
  const now = Date.now()
  const day = isoDate(now)
  const hold = (input.hold ?? '').slice(0, 80)
  const key = `${day}|${domain}|${page}|${input.liga}|${hold}`
  const link = input.link === '0' ? 0 : input.link === '1' ? 1 : -1
  const e = state.queue.get(key)
  if (e) {
    e.views++
    e.ts = now
    if (link >= 0) e.link = link
  } else state.queue.set(key, { day, domain, page, liga: input.liga, hold, link, views: 1, ts: now })
  if (state.queue.size > 5_000) state.queue.clear()
  state.timer ??= setTimeout(flush, 5_000)
}

function flush() {
  state.timer = undefined
  const rows = [...state.queue.values()]
  state.queue.clear()
  const d = db()
  if (!d || !rows.length) return
  try {
    const up = d.prepare(`INSERT INTO hits (day, domain, page, liga, hold, link, views, first_ts, last_ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (day, domain, page, liga, hold) DO UPDATE SET views = views + excluded.views, last_ts = excluded.last_ts,
        link = CASE WHEN excluded.link >= 0 THEN excluded.link ELSE link END`)
    d.exec('BEGIN')
    for (const r of rows) up.run(r.day, r.domain, r.page, r.liga, r.hold, r.link, r.views, r.ts, r.ts)
    d.exec('COMMIT')
  } catch {
    try {
      d.exec('ROLLBACK')
    } catch {
      // nothing to undo
    }
  }
}

export interface WidgetSite {
  domain: string
  views: number
  /** Views in the last 7 days */
  week: number
  firstSeen: number
  lastSeen: number
  pages: { page: string; views: number }[]
  leagues: string[]
  teams: string[]
  /** The link back to us on the latest showing: true, false, or unknown (an old embed code) */
  link: boolean | null
}

/** For /admin/widget: the sites using the table, views per day and per league */
export function widgetStats(days = 30) {
  flush()
  const d = db()
  if (!d) return undefined
  const since = isoDate(Date.now() - (days - 1) * 86_400_000)
  const weekFrom = isoDate(Date.now() - 6 * 86_400_000)
  const today = isoDate(Date.now())
  const rows = d.prepare('SELECT * FROM hits WHERE day >= ? ORDER BY last_ts DESC').all(since)
  const firstSeen = new Map(d.prepare('SELECT domain, MIN(first_ts) AS f FROM hits GROUP BY domain').all().map((r) => [String(r.domain), Number(r.f)]))
  const sites = new Map<string, WidgetSite & { pageMap: Map<string, number>; linkTs: number }>()
  const perDay = new Map<string, number>()
  const perLeague = new Map<string, number>()
  for (const r of rows) {
    const domain = String(r.domain)
    const views = Number(r.views)
    const s =
      sites.get(domain) ??
      sites
        .set(domain, { domain, views: 0, week: 0, firstSeen: firstSeen.get(domain) ?? Number(r.first_ts), lastSeen: 0, pages: [], leagues: [], teams: [], link: null, pageMap: new Map(), linkTs: 0 })
        .get(domain)!
    s.views += views
    if (String(r.day) >= weekFrom) s.week += views
    s.lastSeen = Math.max(s.lastSeen, Number(r.last_ts))
    s.pageMap.set(String(r.page), (s.pageMap.get(String(r.page)) ?? 0) + views)
    if (!s.leagues.includes(String(r.liga))) s.leagues.push(String(r.liga))
    if (r.hold && !s.teams.includes(String(r.hold))) s.teams.push(String(r.hold))
    if (Number(r.link) >= 0 && Number(r.last_ts) > s.linkTs) {
      s.link = Number(r.link) === 1
      s.linkTs = Number(r.last_ts)
    }
    perDay.set(String(r.day), (perDay.get(String(r.day)) ?? 0) + views)
    perLeague.set(String(r.liga), (perLeague.get(String(r.liga)) ?? 0) + views)
  }
  const list = [...sites.values()]
    .map(({ pageMap, linkTs: _linkTs, ...s }) => ({ ...s, pages: [...pageMap].map(([page, views]) => ({ page, views })).sort((a, b) => b.views - a.views) }))
    .sort((a, b) => b.views - a.views)
  const dayList = Array.from({ length: days }, (_, i) => isoDate(Date.now() - (days - 1 - i) * 86_400_000))
  return {
    sites: list,
    days: dayList.map((day) => ({ day, views: perDay.get(day) ?? 0 })),
    leagues: [...perLeague].map(([liga, views]) => ({ liga, views })).sort((a, b) => b.views - a.views),
    today: perDay.get(today) ?? 0,
    week: dayList.slice(-7).reduce((n, day) => n + (perDay.get(day) ?? 0), 0),
    total: list.reduce((n, s) => n + s.views, 0),
    activeWeek: list.filter((s) => s.week > 0).length,
    missingLink: list.filter((s) => s.link === false).length,
  }
}
