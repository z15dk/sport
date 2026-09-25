import 'server-only'
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import type { SportId } from '../types'
import type { ChannelData, ChannelDef, ChannelRule } from '../data/channels'
import { gameKey } from '../data/external'
import { slugify } from './slug'
import { addDays, isoDate } from './time'
import { cacheDir, tsdb } from './tsdb'

// TV channels: the channels, rules and per-match exceptions set in the admin
// pages (channels.json), and TheSportsDB's Danish TV listings (tv.json),
// fetched once or twice a day when the key gives access. Both live in
// /opt/scoreline/data on the VPS, so they survive deploys.

const dir = () => path.join(/*turbopackIgnore: true*/ cacheDir(), 'data')
const configFile = (): string => process.env.CHANNELS_FILE ?? path.join(dir(), 'channels.json')
const tvFile = (): string => process.env.TV_FILE ?? path.join(dir(), 'tv.json')

interface Config {
  channels: ChannelDef[]
  rules: ChannelRule[]
  overrides: Record<string, string>
}

/** What was set up before the admin pages had channels: two channels and their leagues */
const DEFAULT: Config = {
  channels: [
    { id: 'direkte-sport', name: 'Direkte Sport' },
    { id: 'ekstra-bladet', name: 'Ekstra Bladet' },
  ],
  rules: [
    { id: 'r1', channelId: 'direkte-sport', sport: 'ice_hockey', country: 'Denmark' },
    { id: 'r2', channelId: 'direkte-sport', sport: 'soccer', country: 'Denmark', league: '2. division' },
    { id: 'r3', channelId: 'direkte-sport', sport: 'soccer', country: 'Denmark', league: '3. division' },
    { id: 'r4', channelId: 'ekstra-bladet', sport: 'basketball', country: 'Denmark' },
  ],
  overrides: {},
}

function readJson<T>(file: string): { mtime: number; value?: T } {
  try {
    const mtime = statSync(file).mtimeMs
    return { mtime, value: JSON.parse(readFileSync(file, 'utf8')) as T }
  } catch {
    return { mtime: 0 }
  }
}

function writeJson(file: string, value: unknown) {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(`${file}.tmp`, JSON.stringify(value, null, 2))
  renameSync(`${file}.tmp`, file)
}

let config: { mtime: number; value: Config } = { mtime: -1, value: DEFAULT }

export function channelConfig(): Config {
  const read = readJson<Config>(configFile())
  if (read.mtime !== config.mtime) {
    let value = read.value ?? structuredClone(DEFAULT)
    // Links set before (channel-links.json) move into the channels
    if (!read.value) {
      const links = readJson<Record<string, string>>(path.join(dir(), 'channel-links.json')).value ?? {}
      value = { ...value, channels: value.channels.map((c) => (links[c.id] ? { ...c, url: links[c.id] } : c)) }
    }
    config = { mtime: read.mtime, value }
  }
  return config.value
}

function save(next: Config) {
  writeJson(configFile(), next)
}

// ---------------------------------------------------------------- admin changes

const SPORTS: SportId[] = ['soccer', 'basketball', 'ice_hockey', 'handball', 'volleyball', 'american_football']
const cleanText = (v: unknown, max: number) =>
  String(v ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)

function cleanUrl(v: unknown): { url?: string; error?: string } {
  const s = String(v ?? '').trim()
  if (!s) return {}
  try {
    const u = new URL(s)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return { error: 'Adressen skal starte med https://' }
  } catch {
    return { error: 'Skriv en hel adresse, fx https://direktesport.dk' }
  }
  return s.length > 500 ? { error: 'Adressen er for lang' } : { url: s }
}

export type ChannelAction =
  | { action: 'addChannel'; name: string }
  | { action: 'updateChannel'; id: string; name?: string; url?: string }
  | { action: 'deleteChannel'; id: string }
  | { action: 'addRule'; channelId: string; sport?: string; country?: string; league?: string }
  | { action: 'deleteRule'; id: string }
  | { action: 'setOverride'; matchId: string; channelId?: string }

export function applyChannelAction(a: ChannelAction): { error?: string } {
  const c = structuredClone(channelConfig())
  switch (a.action) {
    case 'addChannel': {
      const name = cleanText(a.name, 60)
      if (!name) return { error: 'Skriv kanalens navn' }
      const id = slugify(name)
      if (!id) return { error: 'Ugyldigt navn' }
      if (c.channels.some((x) => x.id === id)) return { error: 'Kanalen findes allerede' }
      c.channels.push({ id, name })
      break
    }
    case 'updateChannel': {
      const ch = c.channels.find((x) => x.id === a.id)
      if (!ch) return { error: 'Ukendt kanal' }
      if (a.name !== undefined) {
        const name = cleanText(a.name, 60)
        if (!name) return { error: 'Navnet må ikke være tomt' }
        ch.name = name
      }
      if (a.url !== undefined) {
        const { url, error } = cleanUrl(a.url)
        if (error) return { error }
        ch.url = url
      }
      break
    }
    case 'deleteChannel':
      c.channels = c.channels.filter((x) => x.id !== a.id)
      c.rules = c.rules.filter((r) => r.channelId !== a.id)
      for (const [k, v] of Object.entries(c.overrides)) if (v === a.id) delete c.overrides[k]
      break
    case 'addRule': {
      if (!c.channels.some((x) => x.id === a.channelId)) return { error: 'Vælg en kanal' }
      const sport = SPORTS.includes(a.sport as SportId) ? (a.sport as SportId) : undefined
      const country = cleanText(a.country, 40) || undefined
      const league = cleanText(a.league, 80) || undefined
      if (!sport && !country && !league) return { error: 'Vælg mindst sport, land eller liga' }
      c.rules.push({ id: randomUUID().slice(0, 8), channelId: a.channelId, sport, country, league })
      break
    }
    case 'deleteRule':
      c.rules = c.rules.filter((r) => r.id !== a.id)
      break
    case 'setOverride': {
      const matchId = cleanText(a.matchId, 120)
      if (!matchId) return { error: 'Ukendt kamp' }
      if (!a.channelId) delete c.overrides[matchId]
      else if (a.channelId === 'none' || c.channels.some((x) => x.id === a.channelId)) c.overrides[matchId] = a.channelId
      else return { error: 'Ukendt kanal' }
      break
    }
    default:
      return { error: 'Ukendt handling' }
  }
  save(c)
  return {}
}

// ---------------------------------------------------------------- TheSportsDB's TV listings

interface TvEvent {
  idEvent: string
  strEvent?: string | null
  strChannel?: string | null
  strLogo?: string | null
  strCountry?: string | null
}
interface TvStore {
  days: Record<string, { fetchedAt: number; events: TvEvent[] }>
  lastError?: string
  lastRun?: number
}

// On globalThis: the job and the pages load separate copies of this module
const holder = globalThis as { __scorelineTv?: TvStore }

function tvStore(): TvStore {
  if (!holder.__scorelineTv) holder.__scorelineTv = readJson<TvStore>(tvFile()).value ?? { days: {} }
  return holder.__scorelineTv
}

let tvRead = { mtime: -1 }
/** Channels and match -> channel ids from the TV listings, with a version */
function tvListings(): { version: string; channels: ChannelDef[]; byMatch: Record<string, string[]> } {
  const read = readJson<TvStore>(tvFile())
  if (read.mtime !== tvRead.mtime && read.value) holder.__scorelineTv = read.value
  tvRead = { mtime: read.mtime }
  const channels = new Map<string, ChannelDef>()
  const byMatch: Record<string, string[]> = {}
  for (const [date, day] of Object.entries(tvStore().days)) {
    for (const e of day.events) {
      if (!e.strChannel) continue
      const id = `tv-${slugify(e.strChannel)}`
      if (!channels.has(id)) channels.set(id, { id, name: e.strChannel, logo: e.strLogo ?? undefined })
      const add = (key: string) => {
        if (!byMatch[key]?.includes(id)) byMatch[key] = [...(byMatch[key] ?? []), id]
      }
      add(`tsdb-${e.idEvent}`)
      const [home, away] = (e.strEvent ?? '').split(/\s+vs\.?\s+/i)
      if (home && away) add(gameKey(`${date}T12:00:00Z`, home, away))
    }
  }
  return { version: String(Math.round(read.mtime)), channels: [...channels.values()], byMatch }
}

async function fetchTv() {
  const store = tvStore()
  const today = isoDate(Date.now())
  for (let i = 0; i < 7; i++) {
    const date = addDays(today, i)
    const day = store.days[date]
    if (day && Date.now() - day.fetchedAt < (i === 0 ? 6 : 12) * 3_600_000) continue
    const { data, error } = await tsdb<{ tvevents?: TvEvent[] | null }>(`eventstv.php?d=${date}&a=Denmark`)
    if (error) {
      store.lastError = error
      break
    }
    store.days[date] = { fetchedAt: Date.now(), events: (data?.tvevents ?? []).filter((e) => !e.strCountry || e.strCountry === 'Denmark') }
    store.lastError = undefined
  }
  for (const d of Object.keys(store.days)) if (d < addDays(today, -2)) delete store.days[d]
  store.lastRun = Date.now()
  try {
    writeJson(tvFile(), store)
  } catch {
    // try again next time
  }
}

let started = false
/** Fetches TheSportsDB's Danish TV listings now and every six hours. Called from instrumentation.ts. */
export function startTvSync() {
  if (started || process.env.TV_LISTINGS === 'off') return
  started = true
  void fetchTv()
  setInterval(() => void fetchTv(), 6 * 3_600_000).unref()
}

/** Everything the site needs to pick channels, and a version that changes with it */
export function channelData(): { version: string; data: ChannelData } {
  const c = channelConfig()
  const tv = tvListings()
  const known = new Set(c.channels.map((x) => x.id))
  return {
    version: `${Math.round(config.mtime)}|${tv.version}`,
    data: {
      channels: [...c.channels, ...tv.channels.filter((x) => !known.has(x.id))],
      rules: c.rules,
      overrides: c.overrides,
      tv: tv.byMatch,
    },
  }
}

/** Numbers for the status page */
export function tvStatus() {
  const store = tvStore()
  const events = Object.values(store.days).flatMap((d) => d.events)
  return {
    lastRun: store.lastRun ? new Date(store.lastRun).toISOString() : null,
    lastError: store.lastError ?? null,
    days: Object.keys(store.days).length,
    events: events.length,
    withChannel: events.filter((e) => e.strChannel).length,
    channels: [...new Set(events.map((e) => e.strChannel).filter(Boolean))].sort() as string[],
  }
}
