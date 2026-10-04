import 'server-only'
import { chmodSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { cacheDir } from './tsdb'

// The social media engine's files, in /opt/scoreline/data/social on the VPS so
// they survive deploys: the settings (config.json), the accounts' keys
// (secrets.json, readable by the server only and never sent to the browser),
// the posts with their results and numbers (posts.json) and the card pictures
// (images/). Everything is changed in /admin/sociale.

export const PLATFORMS = ['facebook', 'instagram', 'threads', 'x'] as const
export type Platform = (typeof PLATFORMS)[number]
export const PLATFORM_NAMES: Record<Platform, string> = { facebook: 'Facebook', instagram: 'Instagram', threads: 'Threads', x: 'X' }
/** The platforms that take stories through their API */
export const STORY_PLATFORMS: Platform[] = ['facebook', 'instagram']

export const KINDS = ['programme', 'topic', 'story', 'results'] as const
export type PostKind = (typeof KINDS)[number]
/** The engine's kinds, and "own": a post the admin writes and schedules by hand (text, own pictures, chosen platforms) */
export type AnyKind = PostKind | 'own'
export const KIND_NAMES: Record<AnyKind, string> = { programme: 'Dagens kampe', topic: 'Dagens emne', story: 'Story før kampstart', results: 'Resultater', own: 'Eget opslag' }

export type Surface = 'feed' | 'story'

/** The day's topics (10–11); the cards are in src/app/admin/sociale/cards.tsx */
export const TOPICS = [
  { id: 'week', name: 'Ugens tal', description: 'Flest mål, overraskelsen, stimen og tilskuere fra de seneste 7 dage' },
  { id: 'scorers', name: 'Topscorerne', description: 'Topscorerlisten i ligaen' },
  { id: 'form', name: 'Formtabellen', description: 'Ligaens hold efter point i de seneste 5 kampe' },
  { id: 'bigmatch', name: 'Ugens kamp', description: 'Optakt til den største kamp de næste 4 dage' },
  { id: 'weekend', name: 'Weekendens program', description: 'De udvalgte kampe lørdag og søndag' },
  { id: 'facts', name: 'Dagens fakta', description: 'Et tal om hver af dagens udvalgte kampe' },
  { id: 'table', name: 'Tabellen', description: 'Stillingen i ligaen' },
] as const
export type TopicId = (typeof TOPICS)[number]['id']
export const isTopic = (v: unknown): v is TopicId => TOPICS.some((t) => t.id === v)

/** Priority keys for matches outside our leagues */
export const EXTERNAL_PRIORITIES = [
  { key: 'x-cl', name: 'Champions League', weight: 90 },
  { key: 'x-clw', name: 'Champions League (kvinder)', weight: 55 },
  { key: 'x-el', name: 'Europa League', weight: 70 },
  { key: 'x-ecl', name: 'Conference League', weight: 60 },
  { key: 'x-cup', name: 'Pokalturneringer', weight: 75 },
  { key: 'x-dk', name: 'Øvrige danske kampe', weight: 30 },
  { key: 'x-other', name: 'Øvrige ligaer', weight: 10 },
] as const

export interface SocialConfig {
  /** The engine plans, makes and posts */
  enabled: boolean
  /** Everything but the real post: plans, pictures and mails, nothing is sent to the platforms */
  dryRun: boolean
  approval: { always: boolean; /** Every post up to and including this date waits for approval */ until?: string }
  email: { to: string; from: string; host: string; port: number; user: string; secure: boolean }
  /** A platform posts only when it is switched on here (and connected) */
  platforms: Record<Platform, boolean>
  kinds: Record<PostKind, { enabled: boolean; platforms: Platform[] }>
  times: { draft: string; programme: string; topic: string; storyBefore: number; resultsAfter: number }
  /** How many matches the day's posts pick */
  matches: number
  /** Weight per league: our division ids and EXTERNAL_PRIORITIES keys; 0 = never */
  weights: Record<string, number>
  /** Clubs that always come first when they play (names from the club register) */
  favorites: string[]
  /** The topic per weekday, 0 = Sunday */
  topics: Record<string, TopicId | 'none'>
  /** The league the topics about one league use (a division id) */
  topicLeague: string
  hashtags: string
  /** New articles shared by themselves when they go live; only those published after `since` (when it was switched on) */
  articles: { enabled: boolean; since?: number }
  /** The day's matches picked by hand, by date */
  manual: Record<string, string[]>
}

export const DEFAULT_CONFIG: SocialConfig = {
  enabled: false,
  dryRun: true,
  approval: { always: false },
  email: { to: '', from: '', host: '', port: 587, user: '', secure: false },
  platforms: { facebook: false, instagram: false, threads: false, x: false },
  kinds: {
    programme: { enabled: true, platforms: ['facebook', 'instagram', 'threads', 'x'] },
    topic: { enabled: true, platforms: ['facebook', 'instagram', 'threads', 'x'] },
    story: { enabled: true, platforms: ['facebook', 'instagram'] },
    results: { enabled: true, platforms: ['facebook', 'instagram', 'threads', 'x'] },
  },
  times: { draft: '06:00', programme: '07:30', topic: '10:30', storyBefore: 60, resultsAfter: 30 },
  matches: 5,
  weights: {},
  favorites: [],
  topics: { '1': 'week', '2': 'scorers', '3': 'form', '4': 'bigmatch', '5': 'weekend', '6': 'facts', '0': 'table' },
  topicLeague: 'superliga',
  hashtags: '#superliga #fodbold #matchly',
  articles: { enabled: false },
  manual: {},
}

export interface SocialSecrets {
  meta: { appId?: string; appSecret?: string; pageId?: string; pageName?: string; pageToken?: string; igUserId?: string; igUsername?: string }
  threads: { userId?: string; username?: string; token?: string; refreshedAt?: number }
  x: { apiKey?: string; apiSecret?: string; accessToken?: string; accessSecret?: string; username?: string }
  smtp: { pass?: string }
  /** Facebook through a Make.com scenario (its webhook's address) when the Page isn't connected directly */
  make: { url?: string }
  /** Signs the approval links in the mails */
  approvalKey: string
}

export interface Metrics {
  views?: number
  reach?: number
  likes?: number
  comments?: number
  shares?: number
  saves?: number
  clicks?: number
}

export interface PublishResult {
  platform: Platform
  surface: Surface
  status: 'ok' | 'error' | 'dry'
  id?: string
  url?: string
  error?: string
  at: number
  metrics?: Metrics
  metricsAt?: number
}

export type PostStatus = 'waiting' | 'publishing' | 'published' | 'partly' | 'failed' | 'skipped' | 'expired' | 'empty'

export const STATUS_NAMES: Record<PostStatus, string> = {
  waiting: 'Venter',
  publishing: 'Poster nu',
  published: 'Postet',
  partly: 'Delvist postet',
  failed: 'Fejlede',
  skipped: 'Sprunget over',
  expired: 'Udløbet',
  empty: 'Intet at poste',
}

export interface SocialPost {
  /** date-kind(-slot), so a day never gets the same post twice */
  id: string
  date: string
  kind: AnyKind
  /** A shared article (its id): an own post the engine made when the article went live */
  article?: number
  /** An own post: the platforms it goes to, and whether its first picture is also a story */
  own?: {
    platforms: Platform[]
    story: boolean
    /** A template whose pictures are made at the post's time (fresh results), and whether its list goes under the admin's text */
    template?: { kind: PostKind; topic?: TopicId; league?: string; focus?: string; women?: boolean; date: string; appendList: boolean }
  }
  topic?: TopicId
  /** Stories: the kick-off time "HH:MM" */
  slot?: string
  matchIds: string[]
  title: string
  caption: string
  /** The page on our site the post points to */
  link: string
  captionEdited?: boolean
  /** The card pictures (file names in images/), in carousel order */
  images: { file: string; surface: Surface }[]
  renderedAt?: number
  renderError?: string
  renderTries?: number
  scheduledAt: number
  expiresAt: number
  status: PostStatus
  approval: 'auto' | 'pending' | 'approved'
  approvedAt?: number
  mailedAt?: number
  note?: string
  results: Record<string, PublishResult>
  createdAt: number
  publishedAt?: number
}

export interface DayPlan {
  date: string
  matchIds: string[]
  plannedAt: number
  /** When every picked match was over (the results post comes a while after) */
  allFinishedAt?: number
}

export interface LogLine {
  at: number
  level: 'info' | 'error'
  text: string
}

interface PostsFile {
  posts: SocialPost[]
  days: Record<string, DayPlan>
  batches: Record<string, { ids: string[]; at: number }>
  log: LogLine[]
  metricsAt?: number
}

export const socialDir = () => process.env.SOCIAL_DIR ?? path.join(/*turbopackIgnore: true*/ cacheDir(), 'data', 'social')
export const imageDir = () => path.join(/*turbopackIgnore: true*/ socialDir(), 'images')

function readJson<T>(file: string): T | undefined {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T
  } catch {
    return undefined
  }
}

function writeJson(file: string, data: unknown, secret = false) {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(`${file}.tmp`, JSON.stringify(data, null, 2), secret ? { mode: 0o600 } : undefined)
  renameSync(`${file}.tmp`, file)
  if (secret) {
    try {
      chmodSync(file, 0o600)
    } catch {
      // not on every file system
    }
  }
}

// ---------------------------------------------------------------- config

const configFile = () => path.join(/*turbopackIgnore: true*/ socialDir(), 'config.json')
let configCache: { mtime: number; config: SocialConfig } = { mtime: -2, config: DEFAULT_CONFIG }

const mtimeOf = (file: string) => {
  try {
    return statSync(file).mtimeMs
  } catch {
    return -1
  }
}

/** The saved settings over the defaults */
export function socialConfig(): SocialConfig {
  const mtime = mtimeOf(configFile())
  if (mtime !== configCache.mtime) {
    const saved = readJson<Partial<SocialConfig>>(configFile()) ?? {}
    const d = DEFAULT_CONFIG
    configCache = {
      mtime,
      config: {
        ...d,
        ...saved,
        approval: { ...d.approval, ...saved.approval },
        email: { ...d.email, ...saved.email },
        platforms: { ...d.platforms, ...saved.platforms },
        kinds: Object.fromEntries(KINDS.map((k) => [k, { ...d.kinds[k], ...saved.kinds?.[k] }])) as SocialConfig['kinds'],
        times: { ...d.times, ...saved.times },
        articles: { ...d.articles, ...saved.articles },
        weights: { ...saved.weights },
        topics: { ...d.topics, ...saved.topics },
        manual: { ...saved.manual },
        favorites: saved.favorites ?? d.favorites,
      },
    }
  }
  return configCache.config
}

export function saveConfig(config: SocialConfig) {
  // Hand-picked days older than two weeks are dropped
  const cut = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10)
  const manual = Object.fromEntries(Object.entries(config.manual).filter(([d]) => d >= cut))
  writeJson(configFile(), { ...config, manual })
}

// ---------------------------------------------------------------- secrets

const secretsFile = () => path.join(/*turbopackIgnore: true*/ socialDir(), 'secrets.json')

export function socialSecrets(): SocialSecrets {
  const saved = readJson<Partial<SocialSecrets>>(secretsFile())
  const secrets: SocialSecrets = {
    meta: { ...saved?.meta },
    threads: { ...saved?.threads },
    x: { ...saved?.x },
    smtp: { ...saved?.smtp },
    make: { ...saved?.make },
    approvalKey: saved?.approvalKey ?? '',
  }
  if (!secrets.approvalKey) {
    secrets.approvalKey = randomBytes(32).toString('base64url')
    writeJson(secretsFile(), secrets, true)
  }
  return secrets
}

export function saveSecrets(update: (s: SocialSecrets) => void) {
  const s = socialSecrets()
  update(s)
  writeJson(secretsFile(), s, true)
}

/** A key as the admin page shows it: only the last 4 characters */
export const masked = (v?: string) => (v ? `••••${v.slice(-4)}` : '')

// ---------------------------------------------------------------- posts

const postsFile = () => path.join(/*turbopackIgnore: true*/ socialDir(), 'posts.json')
let postsCache: { mtime: number; data: PostsFile } | undefined

export function readPosts(): PostsFile {
  const mtime = mtimeOf(postsFile())
  if (!postsCache || postsCache.mtime !== mtime) {
    const saved = readJson<Partial<PostsFile>>(postsFile())
    postsCache = { mtime, data: { posts: saved?.posts ?? [], days: saved?.days ?? {}, batches: saved?.batches ?? {}, log: saved?.log ?? [], metricsAt: saved?.metricsAt } }
  }
  return postsCache.data
}

/** Changes the posts file in one go (the engine and the admin page both write it) */
export function updatePosts<T>(change: (data: PostsFile) => T): T {
  const data = structuredClone(readPosts())
  const out = change(data)
  // Half a year of posts, the newest log lines
  const cut = Date.now() - 183 * 86_400_000
  data.posts = data.posts.filter((p) => p.createdAt > cut)
  const dayCut = new Date(cut).toISOString().slice(0, 10)
  data.days = Object.fromEntries(Object.entries(data.days).filter(([d]) => d >= dayCut))
  data.batches = Object.fromEntries(Object.entries(data.batches).filter(([, b]) => b.at > Date.now() - 14 * 86_400_000))
  data.log = data.log.slice(-300)
  writeJson(postsFile(), data)
  postsCache = { mtime: mtimeOf(postsFile()), data }
  return out
}

export function logLine(text: string, level: LogLine['level'] = 'info') {
  updatePosts((d) => {
    d.log.push({ at: Date.now(), level, text })
  })
  if (level === 'error') console.error(`[sociale] ${text}`)
}

export const findPost = (id: string) => readPosts().posts.find((p) => p.id === id)

/** Whether the posts of a day wait for approval */
export function needsApproval(date: string, config = socialConfig()) {
  return config.approval.always || (!!config.approval.until && date <= config.approval.until)
}

// ---------------------------------------------------------------- tags

/**
 * The clubs' (and leagues') own profiles, by the name the posts write
 * ("Brøndby IF"): each platform has its own @name. When a post mentions the
 * name, the first time it is written is swapped for the tag on the platform the
 * post goes to (src/lib/socialPlatforms.ts, `withTags`). Set on /admin/sociale/tags.
 */
export type Handles = Partial<Record<Platform, string>>

const handlesFile = () => path.join(/*turbopackIgnore: true*/ socialDir(), 'handles.json')
let handlesCache: { mtime: number; handles: Record<string, Handles> } | undefined

export function socialHandles(): Record<string, Handles> {
  const mtime = mtimeOf(handlesFile())
  if (!handlesCache || handlesCache.mtime !== mtime) handlesCache = { mtime, handles: readJson<Record<string, Handles>>(handlesFile()) ?? {} }
  return handlesCache.handles
}

/** A tag as the platform writes it, without "@" and spaces; Facebook also takes a Page's number */
export function cleanHandle(platform: Platform, value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  // A profile link works too: "https://www.instagram.com/brondbyif/" or "threads.net/@brondbyif"
  const v = value
    .trim()
    .replace(/^(https?:\/\/)?(www\.)?[a-z.]+\.(com|net)\//i, '')
    .replace(/^@/, '')
    .replace(/[/?#].*$/, '')
  if (!v) return undefined
  const ok = platform === 'facebook' ? /^[A-Za-z0-9.\-_]{1,80}$/ : platform === 'x' ? /^[A-Za-z0-9_]{1,15}$/ : /^[A-Za-z0-9._]{1,30}$/
  return ok.test(v) ? v : undefined
}

export function saveHandles(name: string, handles: Handles | undefined) {
  const all = { ...socialHandles() }
  const clean: Handles = {}
  for (const p of PLATFORMS) {
    const h = cleanHandle(p, handles?.[p])
    if (h) clean[p] = h
  }
  if (Object.keys(clean).length) all[name] = clean
  else delete all[name]
  writeJson(handlesFile(), all)
}
