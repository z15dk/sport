import 'server-only'
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { DIVISIONS, type Club, type Division } from '../data/leagues'
import { normalize } from '../data/aliases'
import { cacheDir } from './tsdb'

// News from RSS feeds (Indkast, DR, ...) on the club and league pages: the
// headline, the source and the time, linking to the article on the source's
// site; the article itself is never shown. A background job fetches the
// enabled feeds every 15 minutes. An article belongs to a club or league when
// its headline or standfirst names it (the article text is not used: it ends
// with links to articles about other clubs). The feeds are set in
// /admin/indstillinger and kept in /opt/scoreline/data/news-feeds.json, the
// articles in news.json.

export interface Feed {
  id: string
  name: string
  url: string
  enabled: boolean
}

export interface Article {
  id: string
  feed: string
  source: string
  title: string
  link: string
  /** Kick-off style: ms since 1970 */
  date: number
  /** Our clubs (club ids) and leagues (division ids) the headline or standfirst names */
  clubs: string[]
  leagues: string[]
  /** About women's football ("kvinder", "Kvindeligaen", "FCK-pigerne"): shown on the women's team's page, not the club's */
  women?: boolean
  /** Standfirst and categories, kept to match the article again when the rules change */
  text?: string
  cats?: string[]
}

interface FeedStatus {
  fetchedAt?: number
  items?: number
  error?: string
}

interface Store {
  articles: Article[]
  status: Record<string, FeedStatus>
}

const DEFAULT_FEEDS: Feed[] = [
  { id: 'indkast', name: 'Indkast', url: 'https://indkast.dk/feed/', enabled: true },
  { id: 'dr-sporten', name: 'DR', url: 'https://www.dr.dk/nyheder/service/feeds/sporten', enabled: true },
  { id: 'dr-senestesport', name: 'DR', url: 'https://www.dr.dk/nyheder/service/feeds/senestesport', enabled: true },
]

const EVERY_MS = 15 * 60_000
/** Articles older than this are dropped */
const KEEP_MS = 30 * 86_400_000
const MAX_ARTICLES = 3000
const MAX_BYTES = 3_000_000

const dir = () => path.join(/*turbopackIgnore: true*/ cacheDir(), 'data')
const feedsFile = (): string => process.env.NEWS_FEEDS_FILE ?? path.join(dir(), 'news-feeds.json')
const storeFile = (): string => process.env.NEWS_FILE ?? path.join(/*turbopackIgnore: true*/ cacheDir(), 'news.json')

function readJson<T>(file: string): { mtime: number; value?: T } {
  try {
    return { mtime: statSync(file).mtimeMs, value: JSON.parse(readFileSync(file, 'utf8')) as T }
  } catch {
    return { mtime: -1 }
  }
}

function writeJson(file: string, value: unknown) {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(`${file}.tmp`, JSON.stringify(value))
  renameSync(`${file}.tmp`, file)
}

// ---------------------------------------------------------------- feeds (admin)

export function newsFeeds(): Feed[] {
  return readJson<Feed[]>(feedsFile()).value ?? DEFAULT_FEEDS
}

/** An address a feed may have: http(s) on a public host */
function publicUrl(raw: string): URL | undefined {
  try {
    const url = new URL(raw.trim())
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined
    const host = url.hostname
    if (!host.includes('.') || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.)/.test(host) || host.includes(':')) return undefined
    return url
  } catch {
    return undefined
  }
}

export type FeedAction =
  | { type: 'add'; name: string; url: string }
  | { type: 'toggle'; id: string; enabled: boolean }
  | { type: 'remove'; id: string }

export function applyFeedAction(action: FeedAction): { error?: string } {
  const feeds = newsFeeds()
  if (action.type === 'add') {
    const name = String(action.name ?? '').trim().slice(0, 40)
    const url = publicUrl(String(action.url ?? ''))
    if (!name) return { error: 'Skriv et navn på kilden' }
    if (!url) return { error: 'Adressen skal være en offentlig http(s)-adresse' }
    if (feeds.some((f) => f.url === url.href)) return { error: 'Den kilde findes allerede' }
    const id = `${normalize(name).replace(/\s+/g, '-') || 'kilde'}-${Date.now().toString(36)}`
    writeJson(feedsFile(), [...feeds, { id, name, url: url.href, enabled: true }])
  } else if (action.type === 'toggle') {
    if (!feeds.some((f) => f.id === action.id)) return { error: 'Kilden findes ikke' }
    writeJson(feedsFile(), feeds.map((f) => (f.id === action.id ? { ...f, enabled: !!action.enabled } : f)))
  } else if (action.type === 'remove') {
    writeJson(feedsFile(), feeds.filter((f) => f.id !== action.id))
    const store = readStore()
    store.articles = store.articles.filter((a) => a.feed !== action.id)
    delete store.status[action.id]
    saveStore(store)
  } else {
    return { error: 'Ukendt handling' }
  }
  // Fetch right away, so a new or re-enabled source shows up
  void syncNews()
  return {}
}

// ---------------------------------------------------------------- the articles

let cached: { mtime: number; store: Store } | undefined
function readStore(): Store {
  const { mtime, value } = readJson<Store>(storeFile())
  if (cached && cached.mtime === mtime) return cached.store
  const store = value ?? { articles: [], status: {} }
  cached = { mtime, store }
  return store
}

function saveStore(store: Store) {
  try {
    writeJson(storeFile(), store)
  } catch {
    // Try again next run
  }
  cached = undefined
}

export function newsStatus() {
  return readStore().status
}

/** How many articles each club and league has, for the admin page */
export function newsCoverage() {
  const enabled = new Set(newsFeeds().filter((f) => f.enabled).map((f) => f.id))
  const clubs = new Map<string, number>()
  const women = new Map<string, number>()
  const leagues = new Map<string, number>()
  let total = 0
  for (const a of readStore().articles) {
    if (!enabled.has(a.feed)) continue
    total++
    for (const c of a.clubs) (a.women ? women : clubs).set(c, ((a.women ? women : clubs).get(c) ?? 0) + 1)
    if (!a.women) for (const l of a.leagues) leagues.set(l, (leagues.get(l) ?? 0) + 1)
  }
  return { total, clubs, women, leagues }
}

/** The newest articles about a club or a league */
export function newsFor(ref: { club?: string; league?: string; women?: boolean }, limit = 6): Article[] {
  const enabled = new Set(newsFeeds().filter((f) => f.enabled).map((f) => f.id))
  // A league's news: the league itself or any of its clubs
  const clubs = new Set(DIVISIONS.find((d) => d.id === ref.league)?.clubs.map((c) => c.id))
  const about = (a: Article) =>
    ref.club ? a.clubs.includes(ref.club) : ref.league ? a.leagues.includes(ref.league) || a.clubs.some((c) => clubs.has(c)) : false
  return readStore()
    .articles.filter((a) => enabled.has(a.feed) && !!a.women === !!ref.women && about(a))
    .slice(0, limit)
}

// ---------------------------------------------------------------- reading RSS

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()

const tag = (item: string, name: string) => {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(item)
  return m ? m[1] : undefined
}

interface Item {
  id: string
  title: string
  link: string
  date: number
  standfirst: string
  cats: string[]
}

function parseRss(xml: string): Item[] {
  const out: Item[] = []
  for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const item = m[0]
    const title = decode(tag(item, 'title') ?? '')
    const link = decode(tag(item, 'link') ?? '')
    if (!title || !/^https?:\/\//.test(link)) continue
    const date = Date.parse(decode(tag(item, 'pubDate') ?? tag(item, 'dc:date') ?? ''))
    // WordPress adds "Indlægget ... blev først udgivet på ..." to the standfirst
    const standfirst = decode(tag(item, 'description') ?? '').replace(/Indlægget .* blev først udgivet på .*$/, '').trim()
    const cats = [...item.matchAll(/<category(?:\s[^>]*)?>([\s\S]*?)<\/category>/gi)].map((c) => decode(c[1])).filter(Boolean).slice(0, 20)
    out.push({ id: decode(tag(item, 'guid') ?? '') || link, title, link, date: Number.isNaN(date) ? Date.now() : date, standfirst: standfirst.slice(0, 400), cats })
  }
  return out
}

// ---------------------------------------------------------------- which clubs a text names

/** Lowercase words, Danish letters and accents folded ("Brøndby-stjerne" -> "brondby stjerne") */
const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'aa')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)

/** Short names the press uses, by club id */
const NICKNAMES: Record<string, string[]> = {
  fck: ['FCK'],
  bif: ['Brøndby'],
  bmg: ['Gladbach', 'Mönchengladbach'],
  fcb: ['Bayern'],
  bvb: ['Dortmund', 'BVB'],
  b04: ['Leverkusen'],
  rbl: ['Leipzig'],
  'e-mci': ['Man City'],
  'e-mun': ['Man United', 'Man Utd'],
  'e-tot': ['Tottenham', 'Spurs'],
  'e-new': ['Newcastle'],
  'es-bar': ['Barcelona', 'Barça', 'Barca'],
  'es-atm': ['Atlético', 'Atletico'],
}

/** Cities that are also the short form of a club's name: alone they don't name the club ("halvmaraton i København") */
const CITY_ONLY = new Set(['kobenhavn', 'aarhus', 'odense', 'aalborg', 'esbjerg', 'randers', 'viborg', 'silkeborg', 'vejle', 'horsens', 'kolding', 'herning'])

interface Pattern {
  tokens: string[]
  club?: Club
  division?: Division
}

let patterns: { divisions: typeof DIVISIONS; list: Pattern[] } | undefined
function allPatterns(): Pattern[] {
  if (patterns?.divisions === DIVISIONS) return patterns.list
  const list: Pattern[] = []
  const add = (text: string, ref: Omit<Pattern, 'tokens'>) => {
    const tokens = words(text)
    if (tokens.length && tokens.join('').length >= 2) list.push({ tokens, ...ref })
  }
  for (const division of DIVISIONS) {
    for (const n of new Set([division.name, division.originalName].filter((x): x is string => !!x))) add(n, { division })
    for (const club of division.clubs) {
      // Second teams are not the club
      if (/\b(ii|2)$/i.test(club.name)) continue
      const names = [club.name, club.originalName, club.apiName].filter((x): x is string => !!x)
      for (const n of names) {
        // The full name ("FC København", "Randers FC")
        add(n, { club })
        // Without "FC", "IF" etc. ("Brøndby"), unless that is only the city
        const short = normalize(n)
        if (short && !(short.split(' ').length === 1 && (CITY_ONLY.has(short) || short === normalize(club.city)))) add(short, { club })
      }
      for (const n of NICKNAMES[club.id] ?? []) add(n, { club })
    }
  }
  patterns = { divisions: DIVISIONS, list }
  return list
}

/** Whether `tokens` appear in `text` in a row; the last may carry a Danish ending ("Superligaen", "Brøndbys") */
function mentions(text: string[], tokens: string[]) {
  const last = tokens.length - 1
  outer: for (let i = 0; i + last < text.length; i++) {
    for (let j = 0; j <= last; j++) {
      const w = text[i + j]
      const t = tokens[j]
      if (w === t) continue
      if (j === last && (w === `${t}s` || w === `${t}en` || w === `${t}ens` || w === `${t}ets`)) continue
      continue outer
    }
    return true
  }
  return false
}

/** Words that make an article about women's football */
const WOMEN_WORDS = /^(kvind|dame|pige|women|frauen|damallsvenskan|toppserien|wsl$)/

function isWomen(text: string[]) {
  return text.some((w) => WOMEN_WORDS.test(w)) || mentions(text, ['a', 'liga']) || mentions(text, ['liga', 'f'])
}

function match(title: string, standfirst: string, cats: string[] = []) {
  const text = words(`${title} ${standfirst}`)
  const women = isWomen(text) || isWomen(words(cats.join(' ')))
  const clubs = new Set<string>()
  const leagues = new Set<string>()
  for (const p of allPatterns()) {
    if (!mentions(text, p.tokens)) continue
    if (p.club) clubs.add(p.club.id)
    if (p.division) leagues.add(p.division.id)
  }
  return { clubs: [...clubs], leagues: [...leagues], women }
}

// ---------------------------------------------------------------- the job

async function fetchFeed(feed: Feed): Promise<Item[]> {
  const url = publicUrl(feed.url)
  if (!url) throw new Error('Ugyldig adresse')
  const res = await fetch(url, {
    headers: { 'user-agent': 'Matchly/1.0 (+https://matchly.dk)', accept: 'application/rss+xml, application/xml, text/xml' },
    redirect: 'follow',
    // Indkast can be slow to answer
    signal: AbortSignal.timeout(25_000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const text = await res.text()
  if (text.length > MAX_BYTES) throw new Error('Feedet er for stort')
  return parseRss(text)
}

let running = false
export async function syncNews() {
  if (running) return
  running = true
  try {
    const store = readStore()
    const byId = new Map(store.articles.map((a) => [`${a.feed}|${a.id}`, a]))
    for (const feed of newsFeeds().filter((f) => f.enabled)) {
      try {
        const items = await fetchFeed(feed)
        for (const it of items) {
          const key = `${feed.id}|${it.id}`
          byId.set(key, { id: it.id, feed: feed.id, source: feed.name, title: it.title, link: it.link, date: it.date, text: it.standfirst, cats: it.cats, clubs: [], leagues: [] })
        }
        store.status[feed.id] = { fetchedAt: Date.now(), items: items.length }
      } catch (err) {
        store.status[feed.id] = { ...store.status[feed.id], error: (err as Error).message }
      }
    }
    const from = Date.now() - KEEP_MS
    store.articles = [...byId.values()]
      .filter((a) => a.date >= from)
      // Every article matched again, so a change in the rules reaches the older ones too
      .map((a) => ({ ...a, ...match(a.title, a.text ?? '', a.cats) }))
      .sort((a, b) => b.date - a.date)
      .slice(0, MAX_ARTICLES)
    saveStore(store)
  } finally {
    running = false
  }
}

let started = false
/** Starts the news job. Called once from instrumentation.ts. */
export function startNewsSync() {
  if (started || process.env.NEWS === 'off') return
  started = true
  void syncNews()
  setInterval(() => void syncNews(), EVERY_MS).unref()
}
