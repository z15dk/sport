import 'server-only'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import webpush from 'web-push'
import { getMatches } from '../data/matches'
import { teamByName, teamInLeague } from '../data/teams'
import type { Match } from '../types'
import { addDays, isoDate } from './time'
import { cacheDir } from './tsdb'
import { loadRealData } from './realdata'

// Goal alerts ("Målalarm") as web push: a visitor turns them on for the teams
// they follow (Mine hold), the browser gives us a push address, and a job
// watches the day's matches: a goal (with the scorer when a source has him),
// kick-off and the final whistle in a followed team's match are sent to every
// address following it. No app store needed; on iPhone it works once Matchly
// is added to the home screen. Keys are made once and kept in vapid.json,
// the addresses in push.json (both in /opt/scoreline/data).

export interface PushSub {
  endpoint: string
  keys: { p256dh: string; auth: string }
  /** Club slugs */
  teams: string[]
  created: number
}

const EVERY_MS = 15_000
/** How long a goal alert waits for the scorer's name */
const WAIT_FOR_SCORER_MS = 45_000
const MAX_SUBS = 50_000
const MAX_TEAMS = 60

const dir = () => path.join(/*turbopackIgnore: true*/ cacheDir(), 'data')
const subsFile = () => process.env.PUSH_FILE ?? path.join(dir(), 'push.json')
const keysFile = () => path.join(dir(), 'vapid.json')

function writeJson(file: string, value: unknown) {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(`${file}.tmp`, JSON.stringify(value))
  renameSync(`${file}.tmp`, file)
}

// ---------------------------------------------------------------- keys

let keys: { publicKey: string; privateKey: string } | undefined
function vapid() {
  if (keys) return keys
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    keys = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY }
  } else {
    try {
      keys = JSON.parse(readFileSync(keysFile(), 'utf8'))
    } catch {
      keys = webpush.generateVAPIDKeys()
      writeJson(keysFile(), keys)
    }
  }
  webpush.setVapidDetails('https://matchly.dk', keys!.publicKey, keys!.privateKey)
  return keys!
}

export const pushPublicKey = () => vapid().publicKey

// ---------------------------------------------------------------- subscriptions

let subs: PushSub[] | undefined
function allSubs(): PushSub[] {
  if (!subs) {
    try {
      subs = JSON.parse(readFileSync(subsFile(), 'utf8')) as PushSub[]
    } catch {
      subs = []
    }
  }
  return subs
}
const saveSubs = () => {
  try {
    writeJson(subsFile(), allSubs())
  } catch {
    // Kept in memory; saved with the next change
  }
}

const isPushHost = (endpoint: string) => {
  try {
    const url = new URL(endpoint)
    return url.protocol === 'https:' && /(^|\.)(googleapis\.com|mozilla\.com|mozaws\.net|push\.apple\.com|notify\.windows\.com)$/.test(url.hostname)
  } catch {
    return false
  }
}

/** Saves (or updates) a browser's push address and the teams it follows */
export function savePushSub(input: unknown): { error?: string } {
  const body = input as { subscription?: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }; teams?: unknown }
  const endpoint = body.subscription?.endpoint
  const p256dh = body.subscription?.keys?.p256dh
  const auth = body.subscription?.keys?.auth
  if (typeof endpoint !== 'string' || typeof p256dh !== 'string' || typeof auth !== 'string') return { error: 'Ugyldigt abonnement' }
  if (endpoint.length > 1000 || p256dh.length > 200 || auth.length > 100 || !isPushHost(endpoint)) return { error: 'Ugyldigt abonnement' }
  const teams = Array.isArray(body.teams) ? [...new Set(body.teams.filter((t): t is string => typeof t === 'string' && /^[a-z0-9-]{1,80}$/.test(t)))].slice(0, MAX_TEAMS) : []
  const list = allSubs()
  const existing = list.find((s) => s.endpoint === endpoint)
  if (existing) {
    existing.keys = { p256dh, auth }
    existing.teams = teams
  } else {
    if (list.length >= MAX_SUBS) return { error: 'For mange abonnenter' }
    list.push({ endpoint, keys: { p256dh, auth }, teams, created: Date.now() })
  }
  saveSubs()
  return {}
}

export function removePushSub(endpoint: unknown) {
  if (typeof endpoint !== 'string') return
  const list = allSubs()
  const i = list.findIndex((s) => s.endpoint === endpoint)
  if (i >= 0) {
    list.splice(i, 1)
    saveSubs()
  }
}

export const pushStatus = () => ({ subscribers: allSubs().length, teams: new Set(allSubs().flatMap((s) => s.teams)).size })

// ---------------------------------------------------------------- sending

interface Message {
  title: string
  body: string
  url: string
  /** Replaces the match's earlier alert on the device */
  tag: string
}

async function send(sub: PushSub, msg: Message): Promise<boolean> {
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(msg), { TTL: 600, urgency: 'high' })
    return true
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode
    // Gone: the visitor turned alerts off or the browser dropped the address
    return !(status === 404 || status === 410)
  }
}

async function sendTo(slugs: string[], msg: Message) {
  const wanted = new Set(slugs)
  const targets = allSubs().filter((s) => s.teams.some((t) => wanted.has(t)))
  if (!targets.length) return
  vapid()
  const gone: string[] = []
  for (let i = 0; i < targets.length; i += 50) {
    const batch = targets.slice(i, i + 50)
    const ok = await Promise.all(batch.map((s) => send(s, msg)))
    batch.forEach((s, j) => !ok[j] && gone.push(s.endpoint))
  }
  if (gone.length) {
    subs = allSubs().filter((s) => !gone.includes(s.endpoint))
    saveSubs()
  }
}

/** A test message to one browser, right after turning alerts on */
export async function sendWelcome(endpoint: string) {
  const sub = allSubs().find((s) => s.endpoint === endpoint)
  if (!sub) return
  vapid()
  await send(sub, { title: 'Målalarm er slået til', body: 'Du får besked, når dine hold scorer, og når kampene starter og slutter.', url: '/', tag: 'welcome' })
}

// ---------------------------------------------------------------- the job

const slugsOf = (m: Match) =>
  [m.home.name, m.away.name].map((name) => (m.leagueSlug && teamInLeague(m.leagueSlug, name, m.sport)) || teamByName(name)).map((t) => t?.slug).filter((s): s is string => !!s)

const scoreText = (m: Match) => `${m.home.name} ${m.home.score ?? 0}–${m.away.score ?? 0} ${m.away.name}`

interface Seen {
  state: Match['state']
  home: number
  away: number
  /** A goal waiting for its scorer */
  pending?: { side: 'home' | 'away'; since: number }
}
let seen: Map<string, Seen> | undefined

/** The newest goal of one side, when a source has it */
function scorer(m: Match, side: 'home' | 'away') {
  const goals = (m.incidents ?? []).filter((i) => i.side === side && (i.kind === 'goal' || i.kind === 'penalty' || i.kind === 'own-goal'))
  const count = side === 'home' ? (m.home.score ?? 0) : (m.away.score ?? 0)
  // Only when the source has every goal, so the newest is this one
  if (goals.length < count) return undefined
  const g = goals.at(-1)!
  if (!g.player) return undefined
  const kind = g.kind === 'penalty' ? ' (straffe)' : g.kind === 'own-goal' ? ' (selvmål)' : ''
  return `${g.minute}' ${g.player}${kind}`
}

async function tick() {
  if (!allSubs().length) {
    seen = undefined
    return
  }
  loadRealData()
  const now = Date.now()
  const today = isoDate(now)
  const matches = [...getMatches(addDays(today, -1), 'all', now), ...getMatches(today, 'all', now)].filter(
    (m) => m.state === 'live' || (m.state === 'finished' && now - m.kickoff.getTime() < 6 * 3_600_000),
  )
  const first = !seen
  const before = seen ?? new Map<string, Seen>()
  const next = new Map<string, Seen>()
  const followed = new Set(allSubs().flatMap((s) => s.teams))
  for (const m of matches) {
    const slugs = slugsOf(m)
    const home = m.home.score ?? 0
    const away = m.away.score ?? 0
    const prev = before.get(m.id)
    const cur: Seen = { state: m.state, home, away, pending: prev?.pending }
    next.set(m.id, cur)
    // After a restart: only remember, never alert on what already happened
    if (first || !slugs.some((s) => followed.has(s))) continue
    const url = `/kamp/${m.slug}`
    if (!prev && m.state === 'live') {
      await sendTo(slugs, { title: 'Kampen er begyndt', body: `${m.home.name} – ${m.away.name} · ${m.league}`, url, tag: m.id })
    }
    // A match seen for the first time already scoring (it started between two checks): its goals count from 0–0
    const from = prev ?? (m.state === 'live' ? { home: 0, away: 0 } : undefined)
    const goal = async (side: 'home' | 'away', who?: string) => {
      const team = side === 'home' ? m.home.name : m.away.name
      await sendTo(slugs, { title: `⚽ MÅL! ${team}`, body: `${scoreText(m)}${who ? ` · ${who}` : ''}`, url, tag: `${m.id}-${home}-${away}-${side}` })
    }
    if (from && (home > from.home || away > from.away)) {
      // A goal still waiting for its scorer goes now, before the new one
      if (cur.pending) await goal(cur.pending.side)
      // Both sides scored between two checks: the one not waited for goes now
      if (home > from.home && away > from.away) await goal('away')
      cur.pending = { side: home > from.home ? 'home' : 'away', since: now }
    }
    if (cur.pending) {
      const who = scorer(m, cur.pending.side)
      if (who || now - cur.pending.since >= WAIT_FOR_SCORER_MS) {
        await goal(cur.pending.side, who)
        cur.pending = undefined
      }
    }
    if (prev && prev.state !== 'finished' && m.state === 'finished') {
      await sendTo(slugs, { title: 'Slut', body: scoreText(m), url, tag: m.id })
    }
  }
  seen = next
}

let started = false
let running = false
/** Starts the goal alert job. Called once from instrumentation.ts. */
export function startPushSync() {
  if (started || process.env.PUSH === 'off') return
  started = true
  setInterval(() => {
    if (running) return
    running = true
    tick()
      .catch((err) => console.error('[push]', (err as Error).message))
      .finally(() => (running = false))
  }, EVERY_MS).unref()
}
