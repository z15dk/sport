import 'server-only'
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { cacheDir } from './tsdb'
import type { ExternalGame } from '../data/external'

// Matches corrected by hand in the admin pages (the data guard's "Kampe der hænger"), by the source's game id:
// a result the source never sent, or a match hidden from the site (one that does not exist or is wrong in the
// source). Kept in /opt/scoreline/data/match-overrides.json so they survive deploys; the merge
// (src/lib/realdata.ts) puts them on the games. Also the games the admin asked to be fetched again: the job
// (src/lib/apisports.ts) fetches their day once more on its next run.

export interface MatchOverride {
  /** The result typed in: the match is finished with it */
  score?: [number, number]
  /** Not shown anywhere on the site */
  hidden?: boolean
  /** The match as the data guard showed it ("Slovenien U19 (K) – Serbien U19 (K)"), for the list of corrections */
  label?: string
  at: number
}

const file = (): string => process.env.MATCH_OVERRIDES_FILE ?? path.join(/*turbopackIgnore: true*/ cacheDir(), 'data', 'match-overrides.json')
const refetchFile = (): string => path.join(/*turbopackIgnore: true*/ cacheDir(), 'data', 'match-refetch.json')

/** A game of API-Sports' by its id ("football-1234567"); our own leagues' matches (TheSportsDB, DBU) are not corrected here */
export const SOURCE_GAME = /^(?!tsdb-)[a-z_]+-\d{1,12}$/

let cache: { mtime: number; overrides: Record<string, MatchOverride> } = { mtime: -1, overrides: {} }

const mtimeOf = (f: string) => {
  try {
    return statSync(f).mtimeMs
  } catch {
    return 0
  }
}

const writeJson = (f: string, data: unknown) => {
  mkdirSync(path.dirname(f), { recursive: true })
  writeFileSync(`${f}.tmp`, JSON.stringify(data, null, 2))
  renameSync(`${f}.tmp`, f)
}

/** The corrected matches and a version that changes with them */
export function matchOverrides(): { version: string; overrides: Record<string, MatchOverride> } {
  const mtime = mtimeOf(file())
  if (mtime !== cache.mtime) {
    let overrides: Record<string, MatchOverride> = {}
    try {
      overrides = mtime ? (JSON.parse(readFileSync(file(), 'utf8')) as Record<string, MatchOverride>) : {}
    } catch {
      overrides = {}
    }
    cache = { mtime, overrides }
  }
  return { version: String(Math.round(cache.mtime)), overrides: cache.overrides }
}

/** Sets a match's correction: a result, hidden, or nothing (back to the source's) */
export function setMatchOverride(id: string, change: { score?: [number, number]; hidden?: boolean; label?: string } | null): { error?: string } {
  if (!SOURCE_GAME.test(id)) return { error: 'Kun kampe fra API-Sports kan rettes her' }
  if (change?.score && !change.score.every((n) => Number.isInteger(n) && n >= 0 && n <= 99)) return { error: 'Resultatet skal være to tal fra 0 til 99' }
  const overrides = { ...matchOverrides().overrides }
  if (change && (change.score || change.hidden)) overrides[id] = { ...(change.score && { score: change.score }), ...(change.hidden && { hidden: true }), ...(change.label && { label: change.label.slice(0, 120) }), at: Date.now() }
  else delete overrides[id]
  writeJson(file(), overrides)
  return {}
}

/** The source's games with the admin's corrections: hidden ones left out, a typed result as a finished match */
export function withMatchOverrides(games: ExternalGame[], overrides: Record<string, MatchOverride>): ExternalGame[] {
  if (!Object.keys(overrides).length) return games
  const out: ExternalGame[] = []
  for (const g of games) {
    const o = overrides[g.id]
    if (o?.hidden) continue
    out.push(o?.score ? { ...g, state: 'finished', homeScore: o.score[0], awayScore: o.score[1], label: undefined } : g)
  }
  return out
}

/** Asks the job to fetch a game's day again on its next run */
export function requestRefetch(id: string): { error?: string } {
  if (!SOURCE_GAME.test(id)) return { error: 'Kun kampe fra API-Sports kan hentes igen' }
  const ids = new Set(takeRefetchRequests(false))
  ids.add(id)
  writeJson(refetchFile(), [...ids])
  return {}
}

/** The games asked to be fetched again (and, when taken, the request cleared) */
export function takeRefetchRequests(clear = true): string[] {
  let ids: string[] = []
  try {
    ids = (JSON.parse(readFileSync(refetchFile(), 'utf8')) as unknown[]).filter((x): x is string => typeof x === 'string')
  } catch {
    return []
  }
  if (clear && ids.length) writeJson(refetchFile(), [])
  return ids
}
