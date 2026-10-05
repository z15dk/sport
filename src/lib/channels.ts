import 'server-only'
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import type { SportId } from '../types'
import type { ChannelData, ChannelDef, ChannelRule } from '../data/channels'
import { parseBold, parseSportLive, type BoldProgramme, type SportLiveProgramme } from '../data/tvProgrammes'
import { gameKey } from '../data/external'
import { shownTeam } from '../data/countries'
import { alike, normalize } from '../data/aliases'
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

// Read again only when the file has changed (this is asked for on every page and merge): the parsed file is kept
const parsed = new Map<string, { mtime: number; value: unknown }>()
function readJson<T>(file: string): { mtime: number; value?: T } {
  try {
    const mtime = statSync(file).mtimeMs
    const have = parsed.get(file)
    if (have?.mtime === mtime) return { mtime, value: have.value as T }
    const value = JSON.parse(readFileSync(file, 'utf8')) as T
    parsed.set(file, { mtime, value })
    return { mtime, value }
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
type TvListings = { version: string; channels: ChannelDef[]; byMatch: Record<string, string[]> }
let tvMemo: { mtime: number; store: TvStore; out: TvListings } | undefined
/** Channels and match -> channel ids from the TV listings, with a version (worked out again only when they change) */
function tvListings(): TvListings {
  const read = readJson<TvStore>(tvFile())
  if (read.mtime !== tvRead.mtime && read.value) holder.__scorelineTv = read.value
  tvRead = { mtime: read.mtime }
  if (tvMemo && tvMemo.mtime === read.mtime && tvMemo.store === tvStore()) return tvMemo.out
  const out = tvListingsNow()
  tvMemo = { mtime: read.mtime, store: tvStore(), out }
  return out
}
function tvListingsNow(): TvListings {
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
  return { version: String(Math.round(tvRead.mtime)), channels: [...channels.values()], byMatch }
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
  void fetchBold()
  setInterval(() => void fetchBold(), 3 * 3_600_000).unref()
  void fetchSportLive()
  setInterval(() => void fetchSportLive(), 2 * 3_600_000).unref()
}

// ---------------------------------------------------------------- Bold's TV guide

// Bold's TV guide (bold.dk/tv) lists the football matches shown on Danish TV and streaming with the channel for each
// (Viaplay, Disney+, TV 2, TV3, Bold+ ...), from every league. Its programme list is fetched every three hours (a few
// small requests) and kept in bold-tv.json; a match found in it gets its channels from it (after the admin's exceptions and
// TheSportsDB's and DBU's own listings, before the rules). While the list is fresh, which matches are on Bold+ stands
// in it, and a rule in /admin/kanaler that gives Bold+ a whole league (Liga Portugal) is not used (boldTv below).
const BOLD_PROGRAMMES = 'https://api.bold.dk/content/v2/programs?order=upcoming&limit=500&active=1'
const BOLD_FRESH_MS = 3 * 86_400_000
const BOLD_MAX_PAGES = 8
interface BoldStore {
  fetchedAt?: number
  lastError?: string
  programmes: BoldProgramme[]
}
const boldFile = (): string => process.env.BOLD_TV_FILE ?? path.join(dir(), 'bold-tv.json')

async function fetchBold() {
  const store: BoldStore = readJson<BoldStore>(boldFile()).value ?? { programmes: [] }
  try {
    const rows: unknown[] = []
    let last = 1
    for (let page = 1; page <= Math.min(last, BOLD_MAX_PAGES); page++) {
      const res = await fetch(`${BOLD_PROGRAMMES}&page=${page}`, { headers: { 'user-agent': 'Matchly/1.0 (+https://matchly.dk)', accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(20_000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = (await res.json()) as { data?: unknown; last_page?: unknown }
      if (!Array.isArray(body.data)) throw new Error('Uventet svar')
      rows.push(...body.data)
      if (typeof body.last_page === 'number') last = body.last_page
    }
    store.programmes = parseBold(rows)
    store.fetchedAt = Date.now()
    store.lastError = undefined
  } catch (e) {
    // The list from last time is kept (it counts as fresh for three days)
    store.lastError = e instanceof Error ? e.message : String(e)
  }
  try {
    writeJson(boldFile(), store)
  } catch {
    // try again next time
  }
}

/** Numbers for the status page */
export function boldStatus() {
  const store = readJson<BoldStore>(boldFile()).value
  const programmes = (store?.programmes ?? []).filter((p) => p.channel)
  const channels = new Map<string, number>()
  for (const p of programmes) channels.set(p.channel, (channels.get(p.channel) ?? 0) + 1)
  return {
    fetchedAt: store?.fetchedAt ? new Date(store.fetchedAt).toISOString() : null,
    lastError: store?.lastError ?? null,
    programmes: programmes.length,
    channels: [...channels].sort((a, b) => b[1] - a[1]).map(([name, n]) => `${name} (${n})`),
  }
}

export function boldTvVersion() {
  // The hour too: the list stops counting when it has not been fetched for three days
  return `${Math.round(readJson<BoldStore>(boldFile()).mtime)}|${Math.floor(Date.now() / 3_600_000)}`
}

/**
 * The channels of the matches in Bold's TV guide, by match id: the football match on the programme's day (Danish time)
 * with both teams alike, by our name or by its Danish one ("Italien" for Italy). A channel Bold names that we have not
 * set up (in /admin/kanaler, or from DBU's programme) becomes a channel of its own. `plusId` is the Bold+ channel;
 * `listed` says the list is fresh, so it and not a rule decides what is on Bold+.
 */
export function boldTv(
  games: { id: string; sport?: string; country?: string; kickoff: string; home: { name: string }; away: { name: string } }[],
  known: ChannelDef[],
): { tv: Record<string, string[]>; channels: ChannelDef[]; plusId: string; listed: boolean } {
  const byFold = new Map(known.map((c) => [fold(c.name), c]))
  const created = new Map<string, ChannelDef>()
  const channelId = (name: string) => {
    const have = byFold.get(fold(name)) ?? created.get(fold(name))
    if (have) return have.id
    const def: ChannelDef = { id: fold(name) === 'bold+' ? 'bold-plus' : `bold-${slugify(name)}`, name, ...(fold(name) === 'bold+' && { url: 'https://bold.dk' }) }
    created.set(fold(name), def)
    return def.id
  }
  const plusId = channelId('Bold+')
  const store = readJson<BoldStore>(boldFile()).value
  const listed = !!store?.fetchedAt && Date.now() - store.fetchedAt < BOLD_FRESH_MS
  const programmes = (store?.programmes ?? []).filter((p) => p.channel)
  const tv: Record<string, string[]> = {}
  if (!listed || !programmes.length) return { tv, channels: [], plusId, listed }
  const days = new Set(programmes.map((p) => p.start.slice(0, 10)))
  const byDay = new Map<string, typeof games>()
  for (const g of games) {
    if (g.sport && g.sport !== 'soccer') continue
    const day = isoDate(new Date(g.kickoff))
    if (days.has(day)) byDay.set(day, [...(byDay.get(day) ?? []), g])
  }
  const names = (name: string, country?: string) => [name, shownTeam(name, country)]
  for (const p of programmes) {
    const [home, away] = p.name.split(/\s+vs\.?\s+/i)
    if (!home || !away) continue
    const hits = (byDay.get(p.start.slice(0, 10)) ?? []).filter((g) => alike(names(g.home.name, g.country), home) && alike(names(g.away.name, g.country), away))
    if (!hits.length) continue
    const id = channelId(p.channel)
    // The same match can be here twice, from two sources, and in the guide once per channel
    for (const g of hits) if (!tv[g.id]?.includes(id)) tv[g.id] = [...(tv[g.id] ?? []), id]
  }
  return { tv, channels: [...created.values()], plusId, listed }
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

// ---------------------------------------------------------------- DBU's TV channels

/**
 * The channel DBU's match programme names for our Danish divisions (read into billeder.db with the
 * fixtures), joined to the channels set up in /admin/kanaler by name: "Viaplay" → Viaplay. Keyed by the
 * match id ("tsdb-<id>") like TheSportsDB's listings; those and the admin's exceptions still win, and a
 * match DBU names no known channel for falls to the rules.
 */
const DBU_DIVISIONS = ['superliga', '1div', '2div', '3div']
const fold = (s: string) => s.toLowerCase().replace(/[^a-z0-9æøå+]/g, '')
type DbuTv = { tv: Record<string, string[]>; channels: ChannelDef[] }
let dbuCache: ({ key: string } & DbuTv) | undefined

/**
 * A TV channel DBU names that is not set up in /admin/kanaler (the Superliga's "TV 2 SPORT X", "TV3+") becomes a
 * channel of its own, written as the channel writes it; a channel set up in the admin pages with the same name wins.
 * Only names that are TV channels: DBU writes the league ("3. division") where there is no TV.
 */
const BROADCASTER = /^(tv ?2|tv ?3|viaplay|dr ?\d?\b|disney|max\b|discovery|kanal ?5|6'?eren)/i
function dbuChannel(name: string): ChannelDef | undefined {
  if (!BROADCASTER.test(name)) return undefined
  const shown = name.replace(/\bSPORT\b/g, 'Sport').replace(/\bNEWS\b/g, 'News').replace(/\bPLAY\b/g, 'Play')
  return { id: `dbu-${slugify(name)}`, name: shown }
}

export function dbuTvVersion() {
  try {
    return String(Math.round(statSync(photosDb()).mtimeMs))
  } catch {
    return '-'
  }
}

const photosDb = () => process.env.PHOTOS_DB ?? path.join(/*turbopackIgnore: true*/ cacheDir(), 'data', 'billeder.db')

export function dbuTv(leagues: Record<string, { id: string; home: string; away: string; kickoff: string }[]>, channels: ChannelDef[], namesOf: (division: string, team: string) => string[]): DbuTv {
  const byName = new Map(channels.map((c) => [fold(c.name), c.id]))
  const added = new Map<string, ChannelDef>()
  const key = `${dbuTvVersion()}|${channels.map((c) => c.id + c.name).join(',')}|${DBU_DIVISIONS.map((d) => leagues[d]?.length ?? 0).join(',')}`
  if (dbuCache?.key === key) return dbuCache
  const tv: Record<string, string[]> = {}
  const from = addDays(isoDate(Date.now()), -1)
  type Row = { date: string; hn: string; an: string; tv: string }
  let rows: Row[] = []
  try {
    const lib = process.getBuiltinModule?.('node:sqlite') as { DatabaseSync: new (f: string, o?: { readOnly?: boolean }) => { prepare(s: string): { all(...p: unknown[]): unknown[] }; close(): void } } | undefined
    if (lib) {
      const db = new lib.DatabaseSync(photosDb(), { readOnly: true })
      try {
        rows = db
          .prepare(`SELECT m.date, h.name hn, a.name an, m.tv FROM matches m JOIN clubs h ON h.id = m.home_id JOIN clubs a ON a.id = m.away_id WHERE m.tv IS NOT NULL AND m.date >= ?`)
          .all(from) as Row[]
      } finally {
        db.close()
      }
    }
  } catch {
    // no photo database on this server
  }
  // Only channels we know, and the TV channels DBU names itself: DBU writes the league ("3. division") where there is no TV
  const byDate = new Map<string, Row[]>()
  for (const r of rows) {
    if (!byName.has(fold(r.tv))) {
      const channel = dbuChannel(r.tv)
      if (!channel) continue
      byName.set(fold(r.tv), channel.id)
      added.set(channel.id, channel)
    }
    byDate.set(r.date, [...(byDate.get(r.date) ?? []), r])
  }
  for (const d of DBU_DIVISIONS)
    for (const e of leagues[d] ?? []) {
      const date = isoDate(new Date(e.kickoff))
      const day = byDate.get(date)
      if (!day) continue
      const home = namesOf(d, e.home)
      const away = namesOf(d, e.away)
      // The same name first (short ones like "AaB" are too short for the loose match)
      const same = (names: string[], other: string) => names.some((n) => normalize(n) === normalize(other)) || alike(names, other)
      const hit = day.find((r) => same(home, r.hn) && same(away, r.an))
      if (hit) tv[`tsdb-${e.id}`] = [byName.get(fold(hit.tv))!]
    }
  dbuCache = { key, tv, channels: [...added.values()] }
  return dbuCache
}

let groundCache: { key: string; rows: { hn: string; venue: string; date: string }[] } | undefined
function groundRows() {
  const key = dbuTvVersion()
  if (groundCache?.key !== key) {
    let rows: { hn: string; venue: string; date: string }[] = []
    try {
      const lib = process.getBuiltinModule?.('node:sqlite') as { DatabaseSync: new (f: string, o?: { readOnly?: boolean }) => { prepare(s: string): { all(...p: unknown[]): unknown[] }; close(): void } } | undefined
      if (lib) {
        const db = new lib.DatabaseSync(photosDb(), { readOnly: true })
        try {
          rows = db.prepare(`SELECT h.name hn, m.venue venue, m.date date FROM matches m JOIN clubs h ON h.id = m.home_id WHERE m.venue IS NOT NULL AND m.venue <> ''`).all() as typeof rows
        } finally {
          db.close()
        }
      }
    } catch {
      // no photo database on this server
    }
    groundCache = { key, rows }
  }
  return groundCache.rows
}
const noSurface = (venue: string) => venue.replace(/\s*\([^)]*\)\s*$/, '').trim()
const isClub = (names: string[], hn: string) => names.some((n) => normalize(n) === normalize(hn)) || alike(names, hn)

/**
 * The ground a club plays its home matches at, as DBU's match programme names it ("Brøndby Stadion", "Parken"): the one
 * most of its home matches already played are at (a club that moves later in the season, Aarhus Fremad from Riisvangen
 * to JYSK Park, is at its ground now), else the one most of its matches are set at. Without the surface DBU adds
 * ("JYSK Park (kunstgræs)").
 */
export function dbuHomeGround(names: string[]): string | undefined {
  const today = isoDate(Date.now())
  const own = groundRows().filter((r) => isClub(names, r.hn))
  const most = (rows: typeof own) => {
    const count = new Map<string, number>()
    for (const r of rows) count.set(r.venue, (count.get(r.venue) ?? 0) + 1)
    return [...count].sort((a, b) => b[1] - a[1])[0]?.[0]
  }
  const venue = most(own.filter((r) => r.date <= today)) ?? most(own)
  return venue && noSurface(venue)
}

/** The ground a home match is set at, from DBU's programme (the day and the home club); the club's usual ground where DBU has nothing for the day */
export function dbuMatchGround(names: string[], kickoff: Date | string): string | undefined {
  const day = isoDate(typeof kickoff === 'string' ? new Date(kickoff) : kickoff)
  const hit = groundRows().find((r) => r.date === day && isClub(names, r.hn))
  return hit ? noSurface(hit.venue) : dbuHomeGround(names)
}

// ---------------------------------------------------------------- SPORT LIVE's live matches

// The TV channel SPORT LIVE shows single matches live (the Basketliga's match of the week, football now and then).
// Its programme overview (sport-live.dk/programoversigt) is drawn from an open programme file: fetched every two
// hours and kept in sportlive-tv.json. Only what it sends live counts, not repeats and not the studio before a match.
// SPORT LIVE is shown beside the channel a match has already (ChannelData.also), never instead of it.
const SPORTLIVE_PROGRAMME = 'https://sportlivedk.github.io/programoversigt/sportlive_program.xml'
interface SportLiveStore {
  fetchedAt?: number
  lastError?: string
  programmes: SportLiveProgramme[]
}
const sportLiveFile = (): string => process.env.SPORTLIVE_TV_FILE ?? path.join(dir(), 'sportlive-tv.json')

async function fetchSportLive() {
  const store: SportLiveStore = readJson<SportLiveStore>(sportLiveFile()).value ?? { programmes: [] }
  try {
    const res = await fetch(SPORTLIVE_PROGRAMME, { headers: { 'user-agent': 'Matchly/1.0 (+https://matchly.dk)' }, cache: 'no-store', signal: AbortSignal.timeout(15_000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const xml = await res.text()
    if (!xml.includes('<EPG>') || xml.length > 5_000_000) throw new Error('Uventet svar')
    store.programmes = parseSportLive(xml)
    store.fetchedAt = Date.now()
    store.lastError = undefined
  } catch (e) {
    store.lastError = e instanceof Error ? e.message : String(e)
  }
  try {
    writeJson(sportLiveFile(), store)
  } catch {
    // try again next time
  }
}

/** Numbers for the status page */
export function sportLiveStatus() {
  const store = readJson<SportLiveStore>(sportLiveFile()).value
  return { fetchedAt: store?.fetchedAt ? new Date(store.fetchedAt).toISOString() : null, lastError: store?.lastError ?? null, programmes: store?.programmes.length ?? 0 }
}

export function sportLiveTvVersion() {
  return String(Math.round(readJson<SportLiveStore>(sportLiveFile()).mtime))
}

/**
 * The matches SPORT LIVE sends live, by match id: the match on the programme's day whose two teams are the two
 * sides of the programme's title, split at one of its hyphens ("Holbæk-Stenhus-BMS Herlev" has two).
 * A list that has not been fetched for three days is not used.
 */
export function sportLiveTv(games: { id: string; sport?: string; kickoff: string; home: { name: string }; away: { name: string } }[], channels: ChannelDef[]): { also: Record<string, string[]>; channel?: ChannelDef } {
  const store = readJson<SportLiveStore>(sportLiveFile()).value
  const also: Record<string, string[]> = {}
  if (!store?.fetchedAt || Date.now() - store.fetchedAt > BOLD_FRESH_MS || !store.programmes.length) return { also }
  const known = channels.find((c) => fold(c.name) === 'sportlive')
  const id = known?.id ?? 'sport-live'
  const days = new Set(store.programmes.map((p) => p.day))
  const byDay = new Map<string, typeof games>()
  for (const g of games) {
    const day = isoDate(new Date(g.kickoff))
    if (days.has(day)) byDay.set(day, [...(byDay.get(day) ?? []), g])
  }
  for (const p of store.programmes) {
    const parts = p.match.split('-')
    const hits = (byDay.get(p.day) ?? []).filter((g) =>
      (!g.sport || g.sport === p.sport) && parts.slice(1).some((_, i) => alike([g.home.name], parts.slice(0, i + 1).join('-').trim()) && alike([g.away.name], parts.slice(i + 1).join('-').trim())),
    )
    for (const g of hits) also[g.id] = [id]
  }
  return { also, channel: known || !Object.keys(also).length ? undefined : { id, name: 'SPORT LIVE', url: 'https://www.sport-live.dk' } }
}
