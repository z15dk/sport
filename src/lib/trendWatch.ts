import 'server-only'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { allTeams } from '../data/teams'
import { isoDate } from './time'
import { cacheDir } from './tsdb'

// James' trend hunter (the owner's word 11/10-2026): every 10 minutes the site reads Google's trending searches in
// Denmark (the public RSS feed) and keeps those about football – a club, a league or a football word in the search
// or its news. A new one, between 07 and 22, leaves a request (data/trend-request); the server then starts James
// (matchly-trend.path → deploy/claude-editor/TREND.md), who reads them with GET /api/redaktor/trends, writes a quick
// news draft on the best one while the search is hot, and mails it to the owner. At most 3 a day (the API refuses
// more), and a request at most every 30 minutes. State in data/trends.json; TREND_WATCH=off stops it.

const FEED = 'https://trends.google.com/trending/rss?geo=DK'
const EVERY = 10 * 60_000
const REQUEST_GAP = 30 * 60_000
/** Trends James may write about a day */
export const TRENDS_PER_DAY = 3

export interface TrendNews {
  title: string
  url: string
  source: string
}

export interface Trend {
  id: string
  title: string
  /** Google's rough number of searches, e.g. "200+" */
  traffic: string
  news: TrendNews[]
  seenAt: number
  /** new → James has not looked at it; skrevet (with his draft) or spring (with why) */
  state: 'new' | 'skrevet' | 'spring'
  articleId?: number
  why?: string
  at?: number
}

interface State {
  trends: Record<string, Trend>
  requestedAt?: number
}

const file = () => path.join(/*turbopackIgnore: true*/ cacheDir(), 'data', 'trends.json')
const requestFile = () => path.join(/*turbopackIgnore: true*/ cacheDir(), 'data', 'trend-request')

function readState(): State {
  try {
    const s = JSON.parse(readFileSync(file(), 'utf8')) as Partial<State>
    return { trends: s.trends ?? {}, requestedAt: s.requestedAt }
  } catch {
    return { trends: {} }
  }
}

function saveState(s: State, now = Date.now()) {
  // Three days are enough to know what has been seen
  const trends = Object.fromEntries(Object.entries(s.trends).filter(([, t]) => now - t.seenAt < 3 * 86_400_000))
  mkdirSync(path.dirname(file()), { recursive: true })
  writeFileSync(file(), JSON.stringify({ ...s, trends }, null, 2))
}

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()
const tag = (xml: string, name: string) => decode(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(xml)?.[1] ?? '')

/** The feed's searches with their news */
export function parseTrends(xml: string): { title: string; traffic: string; news: TrendNews[] }[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, item]) => ({
    title: tag(item, 'title'),
    traffic: tag(item, 'ht:approx_traffic'),
    news: [...item.matchAll(/<ht:news_item>([\s\S]*?)<\/ht:news_item>/g)].map(([, n]) => ({
      title: tag(n, 'ht:news_item_title'),
      url: tag(n, 'ht:news_item_url'),
      source: tag(n, 'ht:news_item_source'),
    })),
  }))
}

// Football words in Danish and English – a search or its news with one of them is about football
const FOOTBALL =
  /\b(fodbold|football|soccer|superliga(en)?|1\. division|betinia liga|premier league|champions league|europa league|conference league|bundesliga|la ?liga|serie a|ligue 1|eredivisie|landshold(et)?|landskamp|nations league|vm-kval\w*|em-kval\w*|world cup qualif\w*|uefa|fifa|dbu|transfer\w*|målmand|angriber|cheftræner|manager|striker|goalkeeper|hat-?trick|derby|pokal(en)?|fa cup|dfb-pokal|copa del rey|mls|inter miami)\b/i
// Other sports: without a football word too, the search is left alone
const OTHER = /\b(håndbold|handball|ishockey|hockey|nhl|nba|basket\w*|tennis|formel 1|formula 1|f1|grand prix|cykling|tour de france|golf|badminton|boksning|boxing|ufc|nfl|darts|speedway|esport)\b/i

let clubNames: { strong: RegExp; short: RegExp } | undefined
/**
 * The men's football clubs whose league has a page here, as two patterns (whole words): the distinct names (two words
 * or 8+ letters, "Inter Miami", "Barcelona") count anywhere in the search or its news; the short one-word names
 * ("Start", "Union") only as the search itself, as they are everyday words too.
 */
function clubPatterns() {
  if (clubNames) return clubNames
  const strong = new Set<string>()
  const short = new Set<string>()
  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  for (const t of allTeams()) {
    if (t.sport !== 'soccer' || !t.leagueSlug) continue
    for (const n of [t.name, ...(t.names ?? [])]) {
      if (/\(k\)|\b(w|women|u\d\d)\b/i.test(n)) continue
      const clean = n.trim()
      if (clean.length < 4) continue
      ;(clean.includes(' ') || clean.length >= 8 ? strong : short).add(esc(clean))
    }
  }
  const words = (set: Set<string>) => new RegExp(`(?:^|[^\\p{L}])(${[...set].sort((a, b) => b.length - a.length).join('|')})(?:$|[^\\p{L}])`, 'iu')
  clubNames = { strong: words(strong), short: new RegExp(`^(${[...short].join('|')})$`, 'iu') }
  return clubNames
}

/** Whether a search is about football: a football word or a club in it or its news, and not plainly another sport */
export function isFootball(t: { title: string; news: TrendNews[] }): boolean {
  const text = [t.title, ...t.news.map((n) => n.title)].join(' · ')
  const clubs = clubPatterns()
  const football = FOOTBALL.test(text) || clubs.strong.test(text) || clubs.short.test(t.title.trim())
  if (!football) return false
  return !OTHER.test(text) || FOOTBALL.test(text)
}

const hourInDenmark = (now: number) => Number(new Intl.DateTimeFormat('da-DK', { hour: '2-digit', hour12: false, timeZone: 'Europe/Copenhagen' }).format(now))

/** Reads the feed once: keeps the new football searches, and asks for James when there is one for him */
export async function checkTrends(now = Date.now()): Promise<{ added: string[]; requested: boolean }> {
  const res = await fetch(FEED, { headers: { 'user-agent': 'Mozilla/5.0 (Matchly)' }, signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`Google Trends svarede ${res.status}`)
  const s = readState()
  const added: string[] = []
  for (const t of parseTrends(await res.text())) {
    if (!t.title) continue
    const id = `${isoDate(now)}-${t.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-')}`.slice(0, 120)
    // Seen today, or the same search within the last day
    const same = Object.values(s.trends).some((x) => x.id === id || (x.title.toLowerCase() === t.title.toLowerCase() && now - x.seenAt < 86_400_000))
    if (same || !isFootball(t)) continue
    s.trends[id] = { id, title: t.title, traffic: t.traffic, news: t.news.slice(0, 4), seenAt: now, state: 'new' }
    added.push(t.title)
  }
  const hour = hourInDenmark(now)
  const written = writtenToday(s, now)
  const waiting = Object.values(s.trends).some((t) => t.state === 'new' && now - t.seenAt < 6 * 3_600_000)
  const requested = waiting && hour >= 7 && hour < 22 && written < TRENDS_PER_DAY && (!s.requestedAt || now - s.requestedAt > REQUEST_GAP)
  if (requested) {
    s.requestedAt = now
    writeFileSync(requestFile(), new Date(now).toISOString())
  }
  saveState(s, now)
  return { added, requested }
}

const writtenToday = (s: State, now: number) => Object.values(s.trends).filter((t) => t.state === 'skrevet' && t.at && isoDate(t.at) === isoDate(now)).length

/** The football searches James has not looked at (the last 6 hours), newest first, and how many he may still write today */
export function pendingTrends(now = Date.now()): { trends: Trend[]; leftToday: number } {
  const s = readState()
  return {
    trends: Object.values(s.trends)
      .filter((t) => t.state === 'new' && now - t.seenAt < 6 * 3_600_000)
      .sort((a, b) => b.seenAt - a.seenAt),
    leftToday: Math.max(0, TRENDS_PER_DAY - writtenToday(s, now)),
  }
}

/** James wrote a draft on a search (articleId), or skipped it (why) */
export function markTrend(id: string, done: { articleId: number } | { why: string }, now = Date.now()): { error?: string } {
  const s = readState()
  const t = s.trends[id]
  if (!t) return { error: 'Ukendt trend-id' }
  if (t.state !== 'new') return { error: 'Trenden er allerede klaret' }
  if ('articleId' in done) {
    if (writtenToday(s, now) >= TRENDS_PER_DAY) return { error: `Højst ${TRENDS_PER_DAY} trend-artikler om dagen` }
    s.trends[id] = { ...t, state: 'skrevet', articleId: done.articleId, at: now }
  } else s.trends[id] = { ...t, state: 'spring', why: done.why, at: now }
  saveState(s, now)
  return {}
}

let timer: ReturnType<typeof setInterval> | undefined
/** Starts the watch in the worker (instrumentation.ts) */
export function startTrendWatch() {
  if (timer || process.env.TREND_WATCH === 'off') return
  const run = () =>
    checkTrends()
      .then((r) => r.added.length && console.log(`[trends] nye fodboldsøgninger: ${r.added.join(', ')}${r.requested ? ' – James er bedt om at se på dem' : ''}`))
      .catch((e) => console.warn(`[trends] ${e instanceof Error ? e.message : e}`))
  setTimeout(run, 60_000)
  timer = setInterval(run, EVERY)
}
