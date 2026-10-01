import 'server-only'
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseProgram, parseResult, parseSheet, type DbuFixture, type DbuGoal } from './photos/dbu.ts'
import type { LineupPlayer as SheetPlayer } from './photos/names.ts'
import { cacheDir } from './tsdb'
import { runsJobs } from './role'
import { isoDate } from './time'
import { alike, clubNames } from '../data/aliases'
import { seasonClub } from '../data/season'
import type { Lineup } from '../data/matchExtra'
import type { Match } from '../types'

// Team sheets for 2. and 3. division from the governing body's public match pages,
// which our other sources don't have for these leagues: on match day each match page is
// read until its sheet is there (every 15 minutes, a few pages a run with a pause), then
// hourly that day for late changes. Kept in data/dbu-lineups.json, which the site process
// reads; the match page shows them as lists (no positions) when nothing else has them.
// The pools change every season: DBU_LINEUP_POOLS="508656:2-division,508657:3-division".
// DBU_LINEUPS=off switches it off.

const BASE = 'https://www.dbu.dk'
const UA = 'Mozilla/5.0 (compatible; Matchly; +https://matchly.dk)'
const POOLS = (process.env.DBU_LINEUP_POOLS ?? '508656:2-division,508657:3-division')
  .split(',')
  .map((s) => s.trim().split(':'))
  .filter((p) => p[0] && p[1])
  .map(([pool, league]) => ({ pool, league }))

interface Sheet {
  home: SheetPlayer[]
  away: SheetPlayer[]
}
interface Store {
  /** Each pool's fixtures (date and teams), read twice a day */
  programs: Record<string, { at: number; fixtures: DbuFixture[] }>
  /** Each match's sheet (or none yet), by DBU's match key */
  sheets: Record<string, { at: number; sheet?: Sheet }>
  /** Each played match's score and goal scorers (the season, for the top scorers), by DBU's match key */
  results?: Record<string, { at: number; home?: number; away?: number; goals?: DbuGoal[] }>
  /** The latest run, for /admin/data: when, and the latest error */
  status?: { at: number; error?: string; errorAt?: number }
}

const file = () => path.join(/*turbopackIgnore: true*/ cacheDir(), 'data', 'dbu-lineups.json')
const holder = globalThis as typeof globalThis & { __scorelineDbu?: { store: Store; mtime: number; checked: number; started?: boolean } }
const mem = (holder.__scorelineDbu ??= { store: { programs: {}, sheets: {} }, mtime: 0, checked: 0 })

function load() {
  const now = Date.now()
  if (now - mem.checked < 30_000) return mem.store
  mem.checked = now
  try {
    const mtime = statSync(file()).mtimeMs
    if (mtime !== mem.mtime) {
      mem.store = JSON.parse(readFileSync(file(), 'utf8')) as Store
      mem.mtime = mtime
    }
  } catch {
    // Not fetched yet
  }
  return mem.store
}

function save() {
  try {
    mkdirSync(path.dirname(file()), { recursive: true })
    writeFileSync(`${file()}.tmp`, JSON.stringify(mem.store))
    renameSync(`${file()}.tmp`, file())
    mem.mtime = statSync(file()).mtimeMs
  } catch {
    // Written next run
  }
}

async function get(p: string) {
  const res = await fetch(BASE + p, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`${res.status}`)
  return res.text()
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const keyOf = (f: DbuFixture) => f.key

/** One run: programmes when old, then today's match pages without a sheet (or due a re-check) */
async function run() {
  const store = load()
  const now = Date.now()
  const fail = (what: string, e: unknown) => {
    store.status = { ...store.status, at: Date.now(), error: `${what}: ${(e as Error).message}`, errorAt: Date.now() }
  }
  const today = isoDate(now)
  for (const { pool } of POOLS) {
    const prog = store.programs[pool]
    if (prog && now - prog.at < 12 * 3_600_000) continue
    try {
      const fixtures = parseProgram(await get(`/resultater/pulje/${pool}/kampprogramFuld`))
      if (!fixtures.length) throw new Error('ingen kampe fundet på siden')
      store.programs[pool] = { at: now, fixtures }
      save()
    } catch (e) {
      // Tried again next run
      fail(`Kampprogram ${pool}`, e)
    }
    await sleep(3_000)
  }
  // The season's played matches: each page once for its score and goal scorers (the top scorers),
  // a few a run; one that had none yet is tried again after six hours
  const results = (store.results ??= {})
  // An equal share from every pool each run, so 3. division fills up alongside 2. division
  const per = Math.max(2, Math.floor(12 / Math.max(1, POOLS.length)))
  const played = POOLS.flatMap(({ pool }) =>
    (store.programs[pool]?.fixtures ?? [])
      .filter((f) => f.date < today)
      .filter((f) => {
        const r = results[keyOf(f)]
        return !r || (r.home === undefined && now - r.at > 6 * 3_600_000)
      })
      .slice(0, per),
  )
  for (const f of played) {
    try {
      const r = parseResult(await get(f.url))
      results[keyOf(f)] = { at: Date.now(), ...(r ?? {}) }
    } catch (e) {
      results[keyOf(f)] = { ...results[keyOf(f)], at: Date.now() }
      fail(`Kampside ${f.key}`, e)
    }
    await sleep(2_000)
  }
  store.status = { ...store.status, at: Date.now() }
  save()
  // The sheet is filled in before kick-off: read today's pages from the morning
  const hour = Number(new Date(now).toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Europe/Copenhagen' }))
  if (hour < 8 || hour > 22) return
  const due = POOLS.flatMap(({ pool }) => store.programs[pool]?.fixtures ?? [])
    .filter((f) => f.date === today)
    .filter((f) => {
      const s = store.sheets[keyOf(f)]
      return !s || now - s.at > (s.sheet ? 60 : 15) * 60_000
    })
    .slice(0, 6)
  for (const f of due) {
    try {
      const html = await get(f.url)
      const sheet = parseSheet(html)
      const old = store.sheets[keyOf(f)]
      store.sheets[keyOf(f)] = { at: Date.now(), sheet: sheet ?? old?.sheet }
      const result = parseResult(html)
      if (result) (store.results ??= {})[keyOf(f)] = { at: Date.now(), ...result }
    } catch {
      store.sheets[keyOf(f)] = { ...store.sheets[keyOf(f)], at: Date.now() }
    }
    await sleep(3_000)
  }
  // Forget sheets older than a week
  const keep = new Set(POOLS.flatMap(({ pool }) => store.programs[pool]?.fixtures ?? []).filter((f) => f.date >= isoDate(now - 7 * 86_400_000)).map(keyOf))
  for (const k of Object.keys(store.sheets)) if (!keep.has(k)) delete store.sheets[k]
  if (due.length) save()
}

/** The background job (the process that runs the jobs), every five minutes */
export function startDbuLineups() {
  if (mem.started || process.env.DBU_LINEUPS === 'off' || !runsJobs() || !POOLS.length) return
  mem.started = true
  let busy = false
  const tick = () => {
    if (busy) return
    busy = true
    run()
      .catch(() => undefined)
      .finally(() => {
        busy = false
      })
  }
  setTimeout(tick, 60_000).unref?.()
  setInterval(tick, 5 * 60_000).unref?.()
}

const toLineup = (team: string, players: SheetPlayer[]): Lineup => ({
  team,
  startXI: players.filter((p) => !p.reserve).map((p) => ({ name: p.name, number: p.number })),
  substitutes: players.filter((p) => p.reserve).map((p) => ({ name: p.name, number: p.number })),
})

/** A 2. or 3. division match's team sheets, home first, when they have been read */
export function dbuLineups(match: Match): Lineup[] | undefined {
  if (match.sport !== 'soccer' || !POOLS.some((p) => p.league === match.leagueSlug)) return undefined
  const store = load()
  const day = isoDate(match.kickoff)
  const names = (n: string) => {
    const club = seasonClub(n)?.club
    return club ? clubNames(club) : [n]
  }
  const home = names(match.home.name)
  const away = names(match.away.name)
  const pools = POOLS.filter((p) => p.league === match.leagueSlug)
  const f = pools
    .flatMap(({ pool }) => store.programs[pool]?.fixtures ?? [])
    .find((x) => x.date === day && alike(home, x.home) && alike(away, x.away))
  const sheet = f && store.sheets[keyOf(f)]?.sheet
  if (!sheet || (!sheet.home.length && !sheet.away.length)) return undefined
  return [toLineup(match.home.name, sheet.home), toLineup(match.away.name, sheet.away)]
}

export interface TopScorer {
  rank: number
  name: string
  /** The team as DBU writes it, and our club when we know it */
  team: string
  club?: string
  goals: number
  /** Places climbed (positive) or lost since the last match day; undefined when new on the list */
  moved?: number
}

/** The season's top scorers in 2. or 3. division from the match pages read, with the change since the last match day */
export function dbuTopScorers(leagueSlug: string, clubOf: (dbuName: string) => string | undefined): { scorers: TopScorer[]; goals: number; matches: number } | undefined {
  const pools = POOLS.filter((p) => p.league === leagueSlug)
  if (!pools.length) return undefined
  const store = load()
  const games = pools
    .flatMap(({ pool }) => store.programs[pool]?.fixtures ?? [])
    .map((f) => ({ f, r: store.results?.[keyOf(f)] }))
    .filter((x): x is { f: DbuFixture; r: NonNullable<typeof x.r> } => x.r?.home !== undefined && x.r.away !== undefined)
  if (!games.length) return undefined
  const lastDay = games.reduce((d, x) => (x.f.date > d ? x.f.date : d), '')
  const tally = (list: typeof games) => {
    const by = new Map<string, { name: string; team: string; goals: number }>()
    for (const { f, r } of list)
      for (const g of r.goals ?? []) {
        if (!g.name || /selvmål/i.test(g.name)) continue
        const team = g.side === 'home' ? f.home : f.away
        const k = `${g.name}|${team}`
        const e = by.get(k) ?? by.set(k, { name: g.name, team, goals: 0 }).get(k)!
        e.goals++
      }
    const sorted = [...by.values()].sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name, 'da'))
    const rank = new Map<string, number>()
    sorted.forEach((e, i) => rank.set(`${e.name}|${e.team}`, i > 0 && sorted[i - 1].goals === e.goals ? rank.get(`${sorted[i - 1].name}|${sorted[i - 1].team}`)! : i + 1))
    return { sorted, rank }
  }
  const now = tally(games)
  const before = tally(games.filter((x) => x.f.date < lastDay))
  return {
    scorers: now.sorted.slice(0, 15).map((e) => {
      const k = `${e.name}|${e.team}`
      const was = before.rank.get(k)
      return { rank: now.rank.get(k)!, name: e.name, team: e.team, club: clubOf(e.team), goals: e.goals, moved: was === undefined ? undefined : was - now.rank.get(k)! }
    }),
    goals: games.reduce((n, x) => n + (x.r.home ?? 0) + (x.r.away ?? 0), 0),
    matches: games.length,
  }
}

/**
 * For /admin/data: each pool's matches and how many are still to be played. A pool with
 * none left (the autumn's regular season or the season is over) needs the next pool
 * number in DBU_LINEUP_POOLS (and PHOTOS_DBU_POOLS): DBU starts new pools for the spring's
 * promotion and relegation groups and for every new season.
 */
export function dbuPoolStatus() {
  const store = load()
  const today = isoDate(Date.now())
  return POOLS.map(({ pool, league }) => {
    const fixtures = store.programs[pool]?.fixtures ?? []
    const played = fixtures.filter((f) => f.date < today)
    return {
      pool,
      league,
      fixtures: fixtures.length,
      upcoming: fixtures.filter((f) => f.date >= today).length,
      played: played.length,
      read: store.programs[pool]?.at,
      /** Played matches whose page has been read with a score */
      results: played.filter((f) => store.results?.[keyOf(f)]?.home !== undefined).length,
    }
  })
}

/** The job's latest run and error, for /admin/data */
export const dbuJobStatus = () => load().status
