import 'server-only'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { DIVISIONS, allClubs } from '../data/leagues'
import { slugify } from './slug'
import { API_KEY, cacheDir, requestCount, tsdb } from './tsdb'
import { SEARCH_NAMES, normalize } from '../data/aliases'

// Club and league logos.
//
// 1. Local files win: public/logos/<club-slug>.*, public/logos/ligaer/<league-slug>.*,
//    public/logos/bookmakere/<id>.* and public/logos/kanaler/<id>.*
// 2. Otherwise the logo found at TheSportsDB. A background job (started from
//    instrumentation.ts) looks logos up slowly – the free key allows about 30
//    requests a minute – and keeps them in a JSON file that survives restarts
//    and deploys. Pages never wait for TheSportsDB.
// 3. Otherwise TeamBadge draws the initials in the club's colours.

const EXTENSIONS = ['svg', 'png', 'webp', 'jpg']
const FOUND_TTL_MS = 7 * 86_400_000
const MISSING_TTL_MS = 86_400_000

const API_SPORT: Record<string, string> = { soccer: 'Soccer', ice_hockey: 'Ice Hockey', basketball: 'Basketball', handball: 'Handball' }
const API_COUNTRY: Record<string, string> = {
  Danmark: 'Denmark',
  Tyskland: 'Germany',
  Sverige: 'Sweden',
  Norge: 'Norway',
  England: 'England',
  USA: 'United States',
  Europa: 'Worldwide',
}

// ---------------------------------------------------------------- what to look up

type Kind = 'club' | 'league'

interface Wanted {
  key: string // the name pages look logos up by
  kind: Kind
  sport: string
  country: string
  /** Names to search for / match at TheSportsDB, best first */
  names: string[]
}

function wanted(): Wanted[] {
  const clubs: Wanted[] = allClubs().map(({ club, division }) => ({
    key: club.name,
    kind: 'club',
    sport: division.sport ?? 'soccer',
    country: division.country,
    names: [club.apiName, SEARCH_NAMES[club.id], club.name].filter((n): n is string => !!n),
  }))
  const leagues: Wanted[] = [
    ...DIVISIONS.map((d) => ({
      key: d.name,
      kind: 'league' as const,
      sport: d.sport ?? 'soccer',
      country: d.country,
      names: [d.apiLeague, d.name].filter((n): n is string => !!n),
    })),
  ]
  return [...leagues, ...clubs]
}

// ---------------------------------------------------------------- the cache file

interface CacheEntry {
  url?: string
  checkedAt: number
}
interface CacheFile {
  entries: Record<string, CacheEntry>
}

function cacheFile() {
  if (process.env.LOGO_CACHE_FILE) return process.env.LOGO_CACHE_FILE
  return path.join(/*turbopackIgnore: true*/ cacheDir(), 'logo-cache.json')
}

const state: {
  cache: CacheFile
  loaded: boolean
  running: boolean
  lastRun?: number
  lastError?: string
  /** Set when a request in the current lookup failed (network, rate limit, server error) */
  failed: boolean
} = { cache: { entries: {} }, loaded: false, running: false, failed: false }

function load() {
  if (state.loaded) return
  state.loaded = true
  try {
    state.cache = JSON.parse(readFileSync(cacheFile(), 'utf8')) as CacheFile
  } catch {
    state.cache = { entries: {} }
  }
}

function save() {
  try {
    const file = cacheFile()
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(`${file}.tmp`, JSON.stringify(state.cache))
    renameSync(`${file}.tmp`, file)
  } catch (err) {
    state.lastError = `Kunne ikke gemme logo-cache: ${(err as Error).message}`
  }
}

// ---------------------------------------------------------------- TheSportsDB

async function api<T>(query: string): Promise<T | undefined> {
  const { data, error } = await tsdb<T>(query)
  if (error) {
    state.lastError = error
    state.failed = true
  }
  return data
}

interface ApiTeam {
  strTeam: string
  strTeamAlternate?: string | null
  strSport?: string
  strCountry?: string
  strBadge?: string | null
}
interface ApiLeague {
  strLeague: string
  strLeagueAlternate?: string | null
  strBadge?: string | null
  strLogo?: string | null
}

async function findClub(w: Wanted): Promise<string | undefined> {
  const wantedNames = w.names.map(normalize)
  for (const name of w.names) {
    const data = await api<{ teams: ApiTeam[] | null }>(`searchteams.php?t=${encodeURIComponent(name)}`)
    const teams = (data?.teams ?? []).filter(
      (t) => t.strSport === API_SPORT[w.sport] && (!t.strCountry || t.strCountry === (API_COUNTRY[w.country] ?? w.country)),
    )
    // Prefer an exact name match, otherwise the first team of the right sport and country
    const exact = teams.find((t) =>
      [t.strTeam, ...(t.strTeamAlternate ?? '').split(',')].map(normalize).some((n) => n && wantedNames.includes(n)),
    )
    const team = exact ?? teams[0]
    if (team?.strBadge) return `${team.strBadge}/small`
  }
  return undefined
}

const leagueLists = new Map<string, ApiLeague[]>()

async function findLeague(w: Wanted): Promise<string | undefined> {
  const listKey = `${w.country}|${w.sport}`
  if (!leagueLists.has(listKey)) {
    const data = await api<{ countries?: ApiLeague[] | null; countrys?: ApiLeague[] | null }>(
      `search_all_leagues.php?c=${encodeURIComponent(API_COUNTRY[w.country] ?? w.country)}&s=${encodeURIComponent(API_SPORT[w.sport] ?? w.sport)}`,
    )
    if (!data) return undefined
    leagueLists.set(listKey, data.countries ?? data.countrys ?? [])
  }
  const wantedNames = w.names.map(normalize)
  const league = leagueLists
    .get(listKey)!
    .find((l) => [l.strLeague, ...(l.strLeagueAlternate ?? '').split(',')].map(normalize).some((n) => n && wantedNames.includes(n)))
  const badge = league?.strBadge || league?.strLogo
  return badge ? `${badge}/small` : undefined
}

// ---------------------------------------------------------------- background job

function due(key: string, now: number) {
  const e = state.cache.entries[key]
  if (!e) return true
  return now - e.checkedAt > (e.url ? FOUND_TTL_MS : MISSING_TTL_MS)
}

async function runOnce() {
  if (state.running) return
  state.running = true
  load()
  leagueLists.clear()
  try {
    const todo = wanted().filter((w) => due(w.key, Date.now()))
    let sinceSave = 0
    for (const w of todo) {
      state.failed = false
      const url = w.kind === 'club' ? await findClub(w) : await findLeague(w)
      // Only record "no logo" when every request succeeded; otherwise try again next run
      if (url || !state.failed) state.cache.entries[w.key] = { url, checkedAt: Date.now() }
      if (++sinceSave >= 10) {
        save()
        sinceSave = 0
      }
    }
    save()
    state.lastRun = Date.now()
  } finally {
    state.running = false
  }
}

let started = false

/** Starts the logo job: now, and then every six hours. Called once from instrumentation.ts. */
export function startLogoSync() {
  if (started || process.env.LOGO_SYNC === 'off') return
  started = true
  void runOnce()
  setInterval(() => void runOnce(), 6 * 3_600_000).unref()
}

// ---------------------------------------------------------------- reading

function localLogo(slug: string, folder = ''): string | undefined {
  for (const ext of EXTENSIONS) {
    const file = path.join(folder, `${slug}.${ext}`)
    if (existsSync(path.join(process.cwd(), 'public', 'logos', file))) return `/logos/${file.replaceAll(path.sep, '/')}`
  }
  return undefined
}

/** File names (without extension) in public/logos/<folder> */
function filesIn(folder: string): string[] {
  try {
    return readdirSync(path.join(process.cwd(), 'public', 'logos', folder))
      .filter((f) => EXTENSIONS.some((ext) => f.endsWith(`.${ext}`)))
      .map((f) => f.replace(/\.[^.]+$/, ''))
  } catch {
    return []
  }
}

let local: { at: number; map: Record<string, string> } | undefined

/** Local logo files, re-read at most once a minute */
function localLogos() {
  if (local && Date.now() - local.at < 60_000) return local.map
  const map: Record<string, string> = {}
  for (const w of wanted()) {
    const file = w.kind === 'club' ? localLogo(slugify(w.key)) : localLogo(slugify(w.key), 'ligaer')
    if (file) map[w.key] = file
  }
  for (const [folder, prefix] of [['bookmakere', 'bookmaker'], ['kanaler', 'kanal']] as const) {
    for (const id of filesIn(folder)) {
      const file = localLogo(id, folder)
      if (file) map[`${prefix}:${id}`] = file
    }
  }
  local = { at: Date.now(), map }
  return map
}

/** Map of club/league/partner name -> logo URL for everything that has one. Never waits on the network. */
export async function getBadges(): Promise<Record<string, string>> {
  load()
  const map: Record<string, string> = {}
  for (const [key, e] of Object.entries(state.cache.entries)) if (e.url) map[key] = e.url
  return { ...map, ...localLogos() }
}

/** Numbers for the status page */
export function logoStatus() {
  load()
  const all = wanted()
  const has = (w: Wanted) => !!state.cache.entries[w.key]?.url || !!localLogos()[w.key]
  const clubs = all.filter((w) => w.kind === 'club')
  const leagues = all.filter((w) => w.kind === 'league')
  return {
    apiKey: API_KEY === '123' ? 'gratis nøgle (123)' : 'egen nøgle',
    cacheFile: cacheFile(),
    running: state.running,
    lastRun: state.lastRun ? new Date(state.lastRun).toISOString() : null,
    lastError: state.lastError ?? null,
    requestsSinceStart: requestCount,
    clubs: { found: clubs.filter(has).length, total: clubs.length },
    leagues: { found: leagues.filter(has).length, total: leagues.length },
    notChecked: all.filter((w) => !state.cache.entries[w.key] && !localLogos()[w.key]).length,
    missing: all.filter((w) => state.cache.entries[w.key] && !has(w)).map((w) => w.key),
  }
}
