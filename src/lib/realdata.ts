import 'server-only'
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { DIVISIONS, seasonOf, sportOf, type Division } from '../data/leagues'
import { alike, normalize } from '../data/aliases'
import { KNOWN_LEAGUE_IDS, getRealData, setRealData, setRealDataLoader, type RealData, type RealEvent } from '../data/real'
import { incidentsOf, toKickoff, toScore, toState, type ApiEvent } from '../api/thesportsdb'
import { hashString } from '../data/fixtures'
import { cacheDir, tsdb } from './tsdb'
import { databaseSeason, matchKey } from './history'
import { archiveFinished } from './archive'
import { externalGames, seasonGames } from './apisports'
import { divisionOfGame } from '../data/ourLeagues'
import { isoDate } from './time'
import { clubNameOverrides } from './clubNames'
import { leagueNameOverrides } from './leagueNames'
import { customLogoUrl, customLogos } from './customLogos'
import { sameLeagueKeys } from '../data/baselines'
import { CUPS, asCupGame, cupOfGame, ourClubInCup } from '../data/cups'
import type { ExternalGame } from '../data/external'
import { logoCheckVersion, realLogo } from './logoCheck'
import { externalLeagueKey } from '../data/leagues'
import { channelData } from './channels'
import { siteSettings } from './settings'

// Background job fetching real fixtures and results from TheSportsDB for
// every division we list. The whole season is fetched round by round every
// six hours (about 15 minutes for all leagues on the free key); rounds with
// matches around now are refreshed every ten minutes.
// Everything is kept in real-data.json so a restart starts with the data.

const FULL_EVERY_MS = 6 * 3_600_000
const HOT_EVERY_MS = 10 * 60_000
const MAX_ROUNDS = 40

const file = (): string => process.env.REAL_DATA_FILE ?? path.join(/*turbopackIgnore: true*/ cacheDir(), 'real-data.json')

type JobState = {
  running: boolean
  lastFull?: number
  lastHot?: number
  lastError?: string
  requests: number
  missing?: string[]
  /** What each division was matched to at TheSportsDB */
  lookups?: Record<string, string>
  /** When each stale event was last looked up again */
  lookedUp?: Map<string, number>
  /** Every Danish league at TheSportsDB (for the status page), fetched once a day */
  danish?: { fetchedAt: number; leagues: TsdbLeague[] }
  danishFetching?: boolean
}
export interface TsdbLeague {
  id: string
  name: string
  sport: string
  alternate?: string
}
// On globalThis: the job (started from instrumentation) and the pages load separate copies of this module
const holder = globalThis as { __scorelineRealJob?: JobState; __scorelineTsdb?: RealData }
// Per module copy, not on globalThis: the job and the pages each keep their own merged data, so each must merge for itself
let mergedKey: string | undefined
const state = (holder.__scorelineRealJob ??= { running: false, requests: 0 })

// ---------------------------------------------------------------- the two sources

/**
 * The days around today, plus the whole season of the cups we follow
 * (src/data/cups.ts) from API-Sports and our match database, under the cup's
 * own key. A game both have is API-Sports' (live score), with the database's
 * goals and cards, and its result when API-Sports doesn't have one yet.
 */
function withCups(games: ExternalGame[], fromDb: ExternalGame[]): ExternalGame[] {
  const ids = new Set(games.map((g) => g.id))
  const api = [...games, ...seasonGames().filter((g) => cupOfGame(g) && !ids.has(g.id))].map(asCupGame)
  if (!fromDb.length) return api
  const team = (name: string) => {
    const cup = CUPS[0]
    return ourClubInCup(name, cup)?.club.id ?? normalize(name)
  }
  const key = (g: ExternalGame) => `${isoDate(new Date(g.kickoff))}|${team(g.home.name)}|${team(g.away.name)}`
  const db = new Map(fromDb.map((g) => [key(g), g]))
  const out = api.map((g) => {
    if (!cupOfGame(g)) return g
    const same = db.get(key(g))
    if (!same) return g
    db.delete(key(g))
    const final = same.state === 'finished' && g.state !== 'finished' && g.state !== 'live'
    return {
      ...g,
      incidents: g.incidents ?? same.incidents,
      ht: g.ht ?? same.ht,
      ...(final && { state: same.state, homeScore: same.homeScore, awayScore: same.awayScore }),
    }
  })
  return [...out, ...[...db.values()].map(asCupGame)]
}

/** API-Sports' "image not available" pictures left out, so the teams get our neutral badge */
function withoutPlaceholders<G extends { home: { logo?: string }; away: { logo?: string }; league: { logo?: string } }>(g: G): G {
  const [home, away, league] = [realLogo(g.home.logo), realLogo(g.away.logo), realLogo(g.league.logo)]
  if (home === g.home.logo && away === g.away.logo && league === g.league.logo) return g
  return { ...g, home: { ...g.home, logo: home }, away: { ...g.away, logo: away }, league: { ...g.league, logo: league } }
}

/** What TheSportsDB gave us (as saved in real-data.json) */
const base = () => holder.__scorelineTsdb

/**
 * The data pages use: TheSportsDB's leagues, plus this season from our match
 * database for the Danish divisions TheSportsDB has no fixtures for.
 */
function apply() {
  const tsdbData = base()
  const db = databaseSeason()
  const external = externalGames()
  const names = clubNameOverrides()
  const channels = channelData()
  const settings = siteSettings()
  const leagueNames = leagueNameOverrides()
  const logos = Object.keys(customLogos()).length
  const key = `${tsdbData?.version ?? '-'}|${db?.key ?? '-'}|${external.version}|${names.version}|${channels.version}|${settings.version}|${leagueNames.version}|${logos}|${logoCheckVersion()}`
  if (mergedKey === key) return
  mergedKey = key
  const leagues = { ...(tsdbData?.leagues ?? {}) }
  // The source with more of the season wins (our database has the Danish divisions in full)
  for (const [id, events] of Object.entries(db?.leagues ?? {})) if (events.length > (leagues[id]?.length ?? 0)) leagues[id] = events
  // Goals, cards, half-time score and attendance from our database for TheSportsDB's matches
  if (db?.extrasByMatch.size) {
    for (const [id, events] of Object.entries(leagues)) {
      leagues[id] = events.map((e) => {
        if (e.id.startsWith('db-')) return e
        const x = db.extrasByMatch.get(matchKey(e.kickoff, e.home, e.away)) ?? looseExtras(db.extrasList, e)
        return x ? { ...e, incidents: e.incidents ?? x.incidents, ht: e.ht ?? x.ht, spectators: e.spectators ?? x.spectators } : e
      })
    }
  }
  fillFromApiSports(leagues)
  if (!tsdbData && !db && !external.games.length) return setRealData(undefined)
  setRealData({
    version: hashString(key).toString(36),
    fetchedAt: tsdbData?.fetchedAt ?? Date.now(),
    leagues,
    checked: tsdbData?.checked,
    // API-Sports' other leagues with the names and logos set in the admin pages
    external: withCups(external.games, db?.cups ?? []).map(withoutPlaceholders).map((g) => {
      if (divisionOfGame(g)) return g
      const key = externalLeagueKey(g.league)
      // A cup also under the source's own name (the admin pages list API-Sports' leagues by it)
      const keys = [...sameLeagueKeys(key), ...(cupOfGame(g) ? [externalLeagueKey({ ...g.league, originalName: undefined })] : [])]
      const name = keys.map((k) => leagueNames.names[k]).find(Boolean) ?? cupOfGame(g)?.name
      const logo = keys.map((k) => customLogoUrl(`liga-${k}`)).find(Boolean)
      return name || logo ? { ...g, league: { ...g.league, name: name ?? g.league.name, logo: logo ?? g.league.logo, originalName: g.league.originalName ?? (name ? g.league.name : undefined) } } : g
    }),
    leagueNames: leagueNames.names,
    clubNames: names.names,
    channels: channels.data,
    settings: settings.settings,
  })
}

/**
 * API-Sports' finished games in our leagues fill in what TheSportsDB and our
 * database lack: a missing result on a known match, or a match we don't have
 * at all (TheSportsDB's free key only gives the latest games of a league).
 */
function fillFromApiSports(leagues: Record<string, RealEvent[]>) {
  const byDivision = new Map<string, ReturnType<typeof seasonGames>>()
  for (const g of seasonGames()) {
    const d = divisionOfGame(g)?.d
    if (d) byDivision.set(d.id, [...(byDivision.get(d.id) ?? []), g])
  }
  for (const [id, games] of byDivision) {
    const events = [...(leagues[id] ?? [])]
    // This season only: from the first match after the last break of more than 45 days
    const days = [...events.map((e) => e.kickoff), ...games.map((g) => g.kickoff)].map((k) => Date.parse(k)).sort((a, b) => a - b)
    let start = days[0] ?? 0
    for (let i = 1; i < days.length; i++) if (days[i] - days[i - 1] > 45 * 86_400_000) start = days[i]
    // By day, so each game is only compared with the same day's matches
    const byDay = new Map<string, number[]>()
    events.forEach((e, i) => {
      const d = isoDate(new Date(e.kickoff))
      byDay.set(d, [...(byDay.get(d) ?? []), i])
    })
    const knownNames = new Set(events.flatMap((e) => [e.home, e.away]))
    for (const g of games) {
      if (Date.parse(g.kickoff) < start) continue
      const day = isoDate(new Date(g.kickoff))
      const i = (byDay.get(day) ?? []).find((j) => alike([events[j].home], g.home.name) && alike([events[j].away], g.away.name)) ?? -1
      if (i >= 0) {
        const e = events[i]
        if (e.state !== 'finished' || e.homeScore === undefined) events[i] = { ...e, state: 'finished', homeScore: g.homeScore, awayScore: g.awayScore, progress: undefined }
        // Goals and cards from API-Sports where our source has none
        if (!events[i].incidents?.length && g.incidents?.length) events[i] = { ...events[i], incidents: g.incidents, ht: events[i].ht ?? g.ht }
        continue
      }
      // Team names as the league's other matches write them, so a club doesn't appear twice
      const nameOf = (name: string) => {
        const same = [...knownNames].filter((n) => alike([n], name))
        return same.length === 1 ? same[0] : name
      }
      const added = events.push({ id: g.id, round: 0, home: nameOf(g.home.name), away: nameOf(g.away.name), kickoff: g.kickoff, homeScore: g.homeScore, awayScore: g.awayScore, state: 'finished', venue: g.venue, incidents: g.incidents?.length ? g.incidents : undefined, ht: g.ht })
      byDay.set(day, [...(byDay.get(day) ?? []), added - 1])
      knownNames.add(events[added - 1].home).add(events[added - 1].away)
    }
    leagues[id] = events.sort((a, b) => a.kickoff.localeCompare(b.kickoff))
  }
}

/** The database's goals and cards for a match whose team names are written differently: within a day, both teams alike, only one candidate */
function looseExtras(list: NonNullable<ReturnType<typeof databaseSeason>>['extrasList'], e: RealEvent) {
  const t = Date.parse(e.kickoff)
  const found = list.filter((x) => Math.abs(Date.parse(x.kickoff) - t) < 30 * 3_600_000 && alike([x.home], e.home) && alike([x.away], e.away))
  return found.length === 1 ? found[0].extras : undefined
}

function setBase(data: RealData) {
  holder.__scorelineTsdb = data
  apply()
}

// ---------------------------------------------------------------- the cache file

let readAt = 0
let fileMtime = 0

/** Reads the cache file (and the match database) when they have changed; checked at most every 15 seconds */
function loadFromDisk() {
  const now = Date.now()
  if (now - readAt < 15_000) return
  readAt = now
  try {
    const mtime = statSync(file()).mtimeMs
    if (mtime !== fileMtime) {
      fileMtime = mtime
      holder.__scorelineTsdb = JSON.parse(readFileSync(file(), 'utf8')) as RealData
    }
  } catch {
    // No file yet
  }
  try {
    apply()
  } catch (err) {
    state.lastError = `Kampdatabasen kunne ikke læses: ${(err as Error).message}`
  }
}

function save(data: RealData) {
  try {
    mkdirSync(path.dirname(file()), { recursive: true })
    writeFileSync(`${file()}.tmp`, JSON.stringify(data))
    renameSync(`${file()}.tmp`, file())
  } catch (err) {
    state.lastError = `Kunne ikke gemme real-data.json: ${(err as Error).message}`
  }
}

function publish(leagues: Record<string, RealEvent[]>, checked = base()?.checked ?? {}) {
  const version = hashString(JSON.stringify(leagues)).toString(36)
  const data: RealData = { version, fetchedAt: Date.now(), leagues, checked }
  setBase(data)
  save(data)
}

setRealDataLoader(loadFromDisk)

// ---------------------------------------------------------------- TheSportsDB

/** 2026/27 -> 2026-2027, 2026 -> 2026 */
function apiSeason(label: string) {
  const m = /^(\d{4})\/(\d{2})$/.exec(label)
  return m ? `${m[1]}-${m[1].slice(0, 2)}${m[2]}` : label
}

function toReal(e: ApiEvent & { intRound?: string | null }): RealEvent {
  const home = toScore(e.intHomeScore)
  const away = toScore(e.intAwayScore)
  return {
    id: e.idEvent,
    round: Number(e.intRound) || 0,
    home: e.strHomeTeam,
    away: e.strAwayTeam,
    kickoff: toKickoff(e).toISOString(),
    homeScore: home,
    awayScore: away,
    state: toState(e),
    progress: e.strProgress || e.strStatus || undefined,
    venue: e.strVenue ?? undefined,
    incidents: incidentsOf(e),
  }
}

async function fetchRound(leagueId: number, season: string, round: number): Promise<RealEvent[] | undefined> {
  const { data, error } = await tsdb<{ events: ApiEvent[] | null }>(`eventsround.php?id=${leagueId}&r=${round}&s=${season}`)
  state.requests++
  if (error) {
    state.lastError = error
    return undefined
  }
  return (data?.events ?? []).map(toReal)
}

async function fetchSeason(leagueId: number, season: string): Promise<RealEvent[] | undefined> {
  const { data, error } = await tsdb<{ events: ApiEvent[] | null }>(`eventsseason.php?id=${leagueId}&s=${season}`)
  state.requests++
  if (error) {
    state.lastError = error
    return undefined
  }
  return (data?.events ?? []).map(toReal)
}

const sortEvents = (events: RealEvent[]) => events.sort((a, b) => a.kickoff.localeCompare(b.kickoff) || a.id.localeCompare(b.id))

/** The whole season, round by round until the rounds run out */
async function fullLeague(division: Division, leagueId: number): Promise<RealEvent[] | undefined> {
  const season = apiSeason(seasonOf(division))
  const regular = (division.meetings ?? 2) * (division.clubs.length - (division.clubs.length % 2 ? 0 : 1))
  const events: RealEvent[] = []
  for (let r = 1; r <= MAX_ROUNDS; r++) {
    const round = await fetchRound(leagueId, season, r)
    if (!round) return undefined // a failed request: keep what we had
    if (round.length === 0 && r > regular) break
    // Nothing in the first rounds: the league has no rounds for this season here
    if (events.length === 0 && r >= 3) break
    events.push(...round)
  }
  // Some keys cannot look up rounds; the season list is the fallback
  if (events.length === 0) return fetchSeason(leagueId, season)
  return sortEvents(events)
}

const API_SPORT: Record<string, string> = { soccer: 'Soccer', ice_hockey: 'Ice Hockey', basketball: 'Basketball' }
const API_COUNTRY: Record<string, string> = {
  Danmark: 'Denmark',
  Tyskland: 'Germany',
  Sverige: 'Sweden',
  Norge: 'Norway',
  England: 'England',
  Spanien: 'Spain',
  Portugal: 'Portugal',
}
const leagueIds = new Map<string, number | null>()

/** Other names TheSportsDB may use for a division */
const LEAGUE_ALIASES: Record<string, string[]> = {
  '1div': ['Danish 1st Division', 'Danish 1. Division', 'NordicBet Liga', 'Betinia Liga'],
  '2div': ['Danish 2nd Division', 'Danish 2. Division'],
  '3div': ['Danish 3rd Division', 'Danish 3. Division'],
  liga3: ['German 3. Liga', 'German 3 Liga', '3. Liga'],
  metalligaen: ['Danish Metal Ligaen', 'Metal Ligaen', 'Danish Hockey League', 'Danish Ice Hockey League', 'Metal Ligaen Denmark'],
  shl: ['Swedish SHL', 'Swedish Hockey League', 'SHL'],
  basketligaen: ['Danish Basketligaen', 'Basketligaen', 'Danish Basketball League', 'Danish Basket Ligaen'],
}

/** TheSportsDB's id for a division: known, or found by name among the country's leagues */
async function leagueIdFor(division: Division): Promise<number | undefined> {
  if (KNOWN_LEAGUE_IDS[division.id]) return KNOWN_LEAGUE_IDS[division.id]
  if (leagueIds.has(division.id)) return leagueIds.get(division.id) ?? undefined
  const country = API_COUNTRY[division.country] ?? division.country
  const { data, error } = await tsdb<{ countries?: { idLeague: string; strLeague: string; strLeagueAlternate?: string | null }[] | null }>(
    `search_all_leagues.php?c=${encodeURIComponent(country)}&s=${encodeURIComponent(API_SPORT[sportOf(division)] ?? 'Soccer')}`,
  )
  state.requests++
  if (error) {
    state.lastError = error
    return undefined // try again next run
  }
  const wanted = [division.apiLeague, division.name, ...(LEAGUE_ALIASES[division.id] ?? [])]
    .filter((n): n is string => !!n)
    .map(normalize)
  const names = (l: { strLeague: string; strLeagueAlternate?: string | null }) =>
    [l.strLeague, ...(l.strLeagueAlternate ?? '').split(',')].map(normalize).filter(Boolean)
  const leagues = data?.countries ?? []
  // An exact name first; otherwise the shortest league whose name contains ours (not "... Women", "... U19")
  const league =
    leagues.find((l) => names(l).some((n) => wanted.includes(n))) ??
    leagues
      .filter((l) => !/women|kvinde|damer|u\d\d|youth|reserve/i.test(l.strLeague))
      .filter((l) => names(l).some((n) => wanted.some((w) => w.length > 3 && ` ${n} `.includes(` ${w} `))))
      .sort((a, b) => a.strLeague.length - b.strLeague.length)[0]
  state.lookups = { ...state.lookups, [division.id]: league ? `${league.strLeague} (${league.idLeague})` : `ikke fundet blandt ${leagues.length} ligaer i ${country}` }
  leagueIds.set(division.id, league ? Number(league.idLeague) : null)
  return league ? Number(league.idLeague) : undefined
}

/** Leagues with fixtures are refreshed every six hours; leagues not found yet are tried again every run */
const isDue = (divisionId: string, now = Date.now()) =>
  !base()?.leagues[divisionId]?.length || now - (base()?.checked?.[divisionId] ?? 0) > FULL_EVERY_MS - 60_000

/** Fetches every division not looked up within the last six hours */
async function runFull() {
  const missing: string[] = []
  for (const division of DIVISIONS) {
    if (!isDue(division.id)) {
      if (!base()?.leagues[division.id]?.length) missing.push(division.name)
      continue
    }
    const leagueId = await leagueIdFor(division)
    const events = leagueId ? await fullLeague(division, leagueId) : leagueIds.has(division.id) ? [] : undefined
    if (!events) continue // a request failed: try again next run
    if (events.length === 0) missing.push(division.name)
    // Publish league by league, so leagues show up while the rest are fetched
    const leagues = { ...(base()?.leagues ?? {}) }
    if (events.length > 0) leagues[division.id] = events
    publish(leagues, { ...(base()?.checked ?? {}), [division.id]: Date.now() })
  }
  state.missing = missing
  state.lastFull = Date.now()
}

/** Refetches the rounds with matches from six hours ago to three hours ahead */
async function runHot() {
  const current = base()
  if (!current) return
  const now = Date.now()
  const leagues = { ...current.leagues }
  let changed = false
  for (const division of DIVISIONS) {
    const divisionId = division.id
    const events = leagues[divisionId]
    const leagueId = await leagueIdFor(division)
    if (!events || !leagueId) continue
    const rounds = new Set(
      events
        .filter((e) => {
          const t = Date.parse(e.kickoff)
          return t > now - 6 * 3_600_000 && t < now + 3 * 3_600_000 && e.state !== 'finished'
        })
        .map((e) => e.round),
    )
    for (const r of rounds) {
      const fresh = await fetchRound(leagueId, apiSeason(seasonOf(division)), r)
      if (!fresh || fresh.length === 0) continue
      const ids = new Set(fresh.map((e) => e.id))
      leagues[divisionId] = sortEvents([...leagues[divisionId].filter((e) => !ids.has(e.id)), ...fresh])
      changed = true
    }
  }
  // Matches that should have ended hours ago without a result: ask for the event again
  // (TheSportsDB's league lists can keep an old state), a few per run, newest first
  const lookedUp = (state.lookedUp ??= new Map())
  const stale = Object.entries(leagues)
    .flatMap(([divisionId, events]) => events.map((e) => ({ divisionId, e })))
    .filter(({ e }) => {
      const t = Date.parse(e.kickoff)
      return e.state !== 'finished' && e.state !== 'postponed' && t < now - 5 * 3_600_000 && t > now - 30 * 86_400_000 && /^\d+$/.test(e.id)
    })
    .sort((a, b) => b.e.kickoff.localeCompare(a.e.kickoff))
    .filter(({ e }) => now - (lookedUp.get(e.id) ?? 0) > 6 * 3_600_000)
    .slice(0, 6)
  for (const { divisionId, e } of stale) {
    lookedUp.set(e.id, now)
    const { data, error } = await tsdb<{ events: ApiEvent[] | null }>(`lookupevent.php?id=${e.id}`)
    state.requests++
    const fresh = !error && data?.events?.[0] ? toReal(data.events[0]) : undefined
    if (!fresh || fresh.id !== e.id || fresh.state === e.state) continue
    leagues[divisionId] = leagues[divisionId].map((x) => (x.id === e.id ? { ...fresh, round: x.round } : x))
    changed = true
  }
  if (changed) publish(leagues)
  state.lastHot = now
}

async function guarded(job: () => Promise<void>) {
  if (state.running) return
  state.running = true
  try {
    await job()
  } catch (err) {
    state.lastError = (err as Error).message
  } finally {
    state.running = false
  }
}

let started = false

/** Starts the real-data job. Called once from instrumentation.ts. */
export function startRealDataSync() {
  if (started || process.env.REAL_DATA === 'off') return
  started = true
  loadFromDisk()
  // Divisions not looked up lately are fetched right away (also after a deploy that adds leagues)
  if (DIVISIONS.some((d) => isDue(d.id))) void guarded(runFull)
  setInterval(() => void guarded(runFull), 30 * 60_000).unref()
  setInterval(() => void guarded(runHot), HOT_EVERY_MS).unref()
  // Save finished matches to our own statistics bank every five minutes (and once at start)
  const archive = () => {
    readAt = 0 // pick up a changed football.db or real-data.json right away
    loadFromDisk()
    archiveFinished()
  }
  archive()
  setInterval(archive, 5 * 60_000).unref()
}

/** Rebuilds the data now (after a change in the admin pages) */
export function refreshRealData() {
  readAt = 0
  loadFromDisk()
}

/** Makes sure the latest data is loaded before a page renders */
export function loadRealData(): RealData | undefined {
  loadFromDisk()
  return getRealData()
}

/** Numbers for the status page */
export function realDataStatus() {
  const data = loadRealData()
  return {
    file: file(),
    running: state.running,
    fetchedAt: data ? new Date(data.fetchedAt).toISOString() : null,
    lastFull: state.lastFull ? new Date(state.lastFull).toISOString() : null,
    lastHot: state.lastHot ? new Date(state.lastHot).toISOString() : null,
    lastError: state.lastError ?? null,
    requests: state.requests,
    missing: state.missing ?? [],
    leagues: DIVISIONS.map(({ id, name }) => {
      const events = data?.leagues[id] ?? []
      return {
        id,
        name,
        source: events.length && events[0].id.startsWith('db-') ? 'kampdatabasen' : events.length ? 'TheSportsDB' : undefined,
        lookup: KNOWN_LEAGUE_IDS[id] ? `kendt id ${KNOWN_LEAGUE_IDS[id]}` : state.lookups?.[id],
        events: events.length,
        finished: events.filter((e) => e.state === 'finished').length,
        teams: [...new Set(events.flatMap((e) => [e.home, e.away]))].sort(),
      }
    }),
  }
}

/**
 * Every Danish league TheSportsDB has, all sports, with which of our leagues
 * uses it. Fetched in the background once a day; the page never waits.
 */
export function tsdbDanishLeagues(): { fetchedAt?: string; leagues: (TsdbLeague & { ours?: string })[] } {
  const now = Date.now()
  if (!state.danishFetching && (!state.danish || now - state.danish.fetchedAt > 86_400_000)) {
    state.danishFetching = true
    void tsdb<{ countries?: { idLeague: string; strLeague: string; strSport: string; strLeagueAlternate?: string | null }[] | null }>(
      'search_all_leagues.php?c=Denmark',
    )
      .then(({ data, error }) => {
        state.requests++
        if (error || !data) return
        state.danish = {
          fetchedAt: Date.now(),
          leagues: (data.countries ?? []).map((l) => ({ id: l.idLeague, name: l.strLeague, sport: l.strSport, alternate: l.strLeagueAlternate || undefined })),
        }
      })
      .finally(() => {
        state.danishFetching = false
      })
  }
  const used = new Map<string, string>()
  for (const d of DIVISIONS) {
    const known = KNOWN_LEAGUE_IDS[d.id] ?? leagueIds.get(d.id)
    if (known) used.set(String(known), d.name)
  }
  return {
    fetchedAt: state.danish ? new Date(state.danish.fetchedAt).toISOString() : undefined,
    leagues: (state.danish?.leagues ?? [])
      .map((l) => ({ ...l, ours: used.get(l.id) }))
      .sort((a, b) => a.sport.localeCompare(b.sport) || a.name.localeCompare(b.name, 'da')),
  }
}
