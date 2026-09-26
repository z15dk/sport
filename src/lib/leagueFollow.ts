import 'server-only'
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { cacheDir } from './tsdb'

// Leagues switched on or off in the admin pages (by API-Sports' league id, per
// API), over the built-in list of leagues we keep. Kept in
// /opt/scoreline/data/league-follow.json so they survive deploys.

export type FollowChoice = 'on' | 'off'
type Choices = Record<string, FollowChoice>

const file = (): string => process.env.LEAGUE_FOLLOW_FILE ?? path.join(/*turbopackIgnore: true*/ cacheDir(), 'data', 'league-follow.json')

// Shared by the API route and the pages (separate module instances in one process), so a change shows at once
const holder = globalThis as typeof globalThis & { __scorelineLeagueFollow?: { mtime: number; choices: Choices; checkedAt: number } }
const state = (holder.__scorelineLeagueFollow ??= { mtime: -1, choices: {}, checkedAt: 0 })

/** The choices ("football|119" -> on/off) and a version that changes with them */
export function leagueFollowChoices(): { version: string; choices: Choices } {
  if (Date.now() - state.checkedAt > 5_000) {
    state.checkedAt = Date.now()
    let mtime = 0
    try {
      mtime = statSync(file()).mtimeMs
    } catch {
      // no choices yet
    }
    if (mtime !== state.mtime) {
      let choices: Choices = {}
      try {
        choices = mtime ? (JSON.parse(readFileSync(file(), 'utf8')) as Choices) : {}
      } catch {
        choices = {}
      }
      state.mtime = mtime
      state.choices = choices
    }
  }
  return { version: String(Math.round(state.mtime)), choices: state.choices }
}

/** The admin's choice for a league, if any */
export const followChoice = (api: string, leagueId: string): FollowChoice | undefined => leagueFollowChoices().choices[`${api}|${leagueId}`]

/** Switches a league on or off; `undefined` goes back to the built-in list */
export function setLeagueFollow(api: string, leagueId: string, choice: FollowChoice | undefined): { error?: string } {
  if (!/^[a-z-]{2,30}$/.test(api) || !/^\d{1,8}$/.test(leagueId)) return { error: 'Ukendt liga' }
  const choices = { ...leagueFollowChoices().choices }
  const key = `${api}|${leagueId}`
  if (choice) choices[key] = choice
  else delete choices[key]
  mkdirSync(path.dirname(file()), { recursive: true })
  writeFileSync(`${file()}.tmp`, JSON.stringify(choices, null, 2))
  renameSync(`${file()}.tmp`, file())
  state.checkedAt = 0
  return {}
}
