import 'server-only'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { cacheDir } from './tsdb'
import { isoDate } from './time'
import { SITE_URL } from './site'

// Matchly's own full-page ad on other sites (/annonce/helside, embedded with
// public/annonce.js): every showing and every click is counted per day, site,
// page and campaign (the data-kampagne the sender gives each recipient) in
// SQLite (annonce.db, AD_DB) and shown on /admin/annonce. Only the other
// site's address is kept – nothing about its visitors. Written five seconds at a time.

type Row = Record<string, unknown>
interface Db {
  exec(sql: string): void
  prepare(sql: string): { run(...p: unknown[]): unknown; all(...p: unknown[]): Row[] }
}

const file = () => process.env.AD_DB ?? path.join(/*turbopackIgnore: true*/ cacheDir(), 'data', 'annonce.db')

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS hits (
    day TEXT, domain TEXT, page TEXT, campaign TEXT, views INTEGER, clicks INTEGER, first_ts INTEGER, last_ts INTEGER,
    PRIMARY KEY (day, domain, page, campaign)
  );
  CREATE TABLE IF NOT EXISTS clicks (
    day TEXT, campaign TEXT, target TEXT, clicks INTEGER,
    PRIMARY KEY (day, campaign, target)
  );
`

interface Hit {
  day: string
  domain: string
  page: string
  campaign: string
  views: number
  clicks: number
  ts: number
}
interface State {
  db?: Db | null
  queue: Map<string, Hit>
  targets: Map<string, { day: string; campaign: string; target: string; clicks: number }>
  timer?: ReturnType<typeof setTimeout>
}
const holder = globalThis as typeof globalThis & { __scorelineAdStats?: State }
const state: State = (holder.__scorelineAdStats ??= { queue: new Map(), targets: new Map() })

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

const ROBOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|facebookexternalhit|embedly|whatsapp|telegram|curl|wget|python|axios|node-fetch|playwright|puppeteer|phantom/i
const ourHost = () => {
  try {
    return new URL(SITE_URL).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** The campaign name as it is kept: letters, digits, dashes, at most 60 characters; empty = "(uden navn)" */
export const campaignKey = (raw: string | null | undefined) => (raw ?? '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}._-]/gu, '').slice(0, 60)

interface Input {
  /** The host page (?side=), else the referer */
  page?: string | null
  referer?: string | null
  campaign?: string | null
  ua?: string | null
  preview?: boolean
}

/** The host page's domain and address, or nothing when the showing should not be counted */
function placeOf(input: Input): { domain: string; page: string } | undefined {
  if (input.preview || ROBOT.test(input.ua ?? '')) return undefined
  let url: URL
  try {
    url = new URL(input.page || input.referer || '')
  } catch {
    return undefined
  }
  if (!/^https?:$/.test(url.protocol)) return undefined
  const domain = url.hostname.replace(/^www\./, '').toLowerCase()
  if (!domain || domain === ourHost() || domain === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(domain)) return undefined
  return { domain, page: `${url.origin}${url.pathname}`.slice(0, 300) }
}

function note(input: Input, kind: 'view' | 'click') {
  const place = placeOf(input)
  if (!place) return
  const now = Date.now()
  const day = isoDate(now)
  const campaign = campaignKey(input.campaign)
  const key = `${day}|${place.domain}|${place.page}|${campaign}`
  const e = state.queue.get(key)
  if (e) {
    if (kind === 'view') e.views++
    else e.clicks++
    e.ts = now
  } else state.queue.set(key, { day, domain: place.domain, page: place.page, campaign, views: kind === 'view' ? 1 : 0, clicks: kind === 'click' ? 1 : 0, ts: now })
  if (state.queue.size > 5_000) state.queue.clear()
  state.timer ??= setTimeout(flush, 5_000)
  return { day, campaign }
}

/** One showing of the ad on another site (our own pages, the admin preview and robots are not counted) */
export function noteAdView(input: Input) {
  note(input, 'view')
}

/** A click on the ad, and what was clicked (the front page, a match, a feature) */
export function noteAdClick(input: Input & { target: string }) {
  const r = note(input, 'click')
  if (!r) return
  const target = input.target.slice(0, 200)
  const key = `${r.day}|${r.campaign}|${target}`
  const t = state.targets.get(key)
  if (t) t.clicks++
  else state.targets.set(key, { day: r.day, campaign: r.campaign, target, clicks: 1 })
  if (state.targets.size > 5_000) state.targets.clear()
}

function flush() {
  state.timer = undefined
  const rows = [...state.queue.values()]
  const targets = [...state.targets.values()]
  state.queue.clear()
  state.targets.clear()
  const d = db()
  if (!d || (!rows.length && !targets.length)) return
  try {
    const up = d.prepare(`INSERT INTO hits (day, domain, page, campaign, views, clicks, first_ts, last_ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (day, domain, page, campaign) DO UPDATE SET views = views + excluded.views, clicks = clicks + excluded.clicks, last_ts = excluded.last_ts`)
    const upT = d.prepare(`INSERT INTO clicks (day, campaign, target, clicks) VALUES (?, ?, ?, ?)
      ON CONFLICT (day, campaign, target) DO UPDATE SET clicks = clicks + excluded.clicks`)
    d.exec('BEGIN')
    for (const r of rows) up.run(r.day, r.domain, r.page, r.campaign, r.views, r.clicks, r.ts, r.ts)
    for (const t of targets) upT.run(t.day, t.campaign, t.target, t.clicks)
    d.exec('COMMIT')
  } catch {
    try {
      d.exec('ROLLBACK')
    } catch {
      // nothing to undo
    }
  }
}

export interface AdSite {
  domain: string
  views: number
  clicks: number
  /** Views and clicks in the last 7 days */
  week: number
  weekClicks: number
  firstSeen: number
  lastSeen: number
  pages: { page: string; views: number; clicks: number }[]
  campaigns: string[]
}

export interface AdCampaign {
  campaign: string
  views: number
  clicks: number
  sites: string[]
  lastSeen: number
}

/** Click-through rate as a percentage with one decimal, or undefined without views */
export const ctr = (views: number, clicks: number) => (views > 0 ? Math.round((clicks / views) * 1000) / 10 : undefined)

/** For /admin/annonce: the sites showing the ad, views and clicks per day, per campaign and per target */
export function adStats(days = 30) {
  flush()
  const d = db()
  if (!d) return undefined
  const since = isoDate(Date.now() - (days - 1) * 86_400_000)
  const weekFrom = isoDate(Date.now() - 6 * 86_400_000)
  const today = isoDate(Date.now())
  const rows = d.prepare('SELECT * FROM hits WHERE day >= ? ORDER BY last_ts DESC').all(since)
  const firstSeen = new Map(d.prepare('SELECT domain, MIN(first_ts) AS f FROM hits GROUP BY domain').all().map((r) => [String(r.domain), Number(r.f)]))
  const sites = new Map<string, AdSite & { pageMap: Map<string, { views: number; clicks: number }> }>()
  const campaigns = new Map<string, AdCampaign>()
  const perDay = new Map<string, { views: number; clicks: number }>()
  for (const r of rows) {
    const domain = String(r.domain)
    const views = Number(r.views)
    const clicks = Number(r.clicks)
    const day = String(r.day)
    const ts = Number(r.last_ts)
    const s =
      sites.get(domain) ??
      sites.set(domain, { domain, views: 0, clicks: 0, week: 0, weekClicks: 0, firstSeen: firstSeen.get(domain) ?? Number(r.first_ts), lastSeen: 0, pages: [], campaigns: [], pageMap: new Map() }).get(domain)!
    s.views += views
    s.clicks += clicks
    if (day >= weekFrom) {
      s.week += views
      s.weekClicks += clicks
    }
    s.lastSeen = Math.max(s.lastSeen, ts)
    const page = String(r.page)
    const p = s.pageMap.get(page) ?? s.pageMap.set(page, { views: 0, clicks: 0 }).get(page)!
    p.views += views
    p.clicks += clicks
    const campaign = String(r.campaign)
    if (!s.campaigns.includes(campaign)) s.campaigns.push(campaign)
    const c = campaigns.get(campaign) ?? campaigns.set(campaign, { campaign, views: 0, clicks: 0, sites: [], lastSeen: 0 }).get(campaign)!
    c.views += views
    c.clicks += clicks
    c.lastSeen = Math.max(c.lastSeen, ts)
    if (!c.sites.includes(domain)) c.sites.push(domain)
    const pd = perDay.get(day) ?? perDay.set(day, { views: 0, clicks: 0 }).get(day)!
    pd.views += views
    pd.clicks += clicks
  }
  const targets = d
    .prepare('SELECT target, SUM(clicks) AS n FROM clicks WHERE day >= ? GROUP BY target ORDER BY n DESC LIMIT 20')
    .all(since)
    .map((r) => ({ target: String(r.target), clicks: Number(r.n) }))
  const list = [...sites.values()]
    .map(({ pageMap, ...s }) => ({ ...s, pages: [...pageMap].map(([page, v]) => ({ page, ...v })).sort((a, b) => b.views - a.views) }))
    .sort((a, b) => b.views - a.views)
  const dayList = Array.from({ length: days }, (_, i) => isoDate(Date.now() - (days - 1 - i) * 86_400_000))
  const sum = (from: string, k: 'views' | 'clicks') => dayList.filter((day) => day >= from).reduce((n, day) => n + (perDay.get(day)?.[k] ?? 0), 0)
  return {
    sites: list,
    campaigns: [...campaigns.values()].sort((a, b) => b.views - a.views),
    targets,
    days: dayList.map((day) => ({ day, views: perDay.get(day)?.views ?? 0, clicks: perDay.get(day)?.clicks ?? 0 })),
    today: { views: perDay.get(today)?.views ?? 0, clicks: perDay.get(today)?.clicks ?? 0 },
    week: { views: sum(weekFrom, 'views'), clicks: sum(weekFrom, 'clicks') },
    total: { views: list.reduce((n, s) => n + s.views, 0), clicks: list.reduce((n, s) => n + s.clicks, 0) },
    activeWeek: list.filter((s) => s.week > 0).length,
  }
}
