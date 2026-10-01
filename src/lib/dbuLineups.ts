import 'server-only'
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseProgram, parseSheet, type DbuFixture } from './photos/dbu.ts'
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
  const today = isoDate(now)
  for (const { pool } of POOLS) {
    const prog = store.programs[pool]
    if (prog && now - prog.at < 12 * 3_600_000) continue
    try {
      store.programs[pool] = { at: now, fixtures: parseProgram(await get(`/resultater/pulje/${pool}/kampprogramFuld`)) }
      save()
    } catch {
      // Tried again next run
    }
    await sleep(3_000)
  }
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
      const sheet = parseSheet(await get(f.url))
      const old = store.sheets[keyOf(f)]
      store.sheets[keyOf(f)] = { at: Date.now(), sheet: sheet ?? old?.sheet }
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
