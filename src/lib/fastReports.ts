import 'server-only'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { getMatches, isWomenMatch } from '../data/matches'
import type { Match } from '../types'
import { isoDate } from './time'
import { cacheDir } from './tsdb'

// James' fast match reports: every 5 minutes the finished Superliga and 1. division matches of the last hours are
// noted; 15 minutes after the final whistle (so the goals and cards have settled) the site leaves a request
// (data/referat-request) and the server starts James (matchly-referat.path → deploy/claude-editor/NYHEDER.md, the
// referat round), who reads the matches with GET /api/redaktor/referater, writes a report draft with the result
// graphic, marks it written and publishes it himself (the owner's word 9/10-2026; out on Facebook with his post text) –
// only when the checklist has nothing red. State in data/hurtige-referater.json;
// FAST_REPORTS=off stops it.

export const FAST_REPORT_LEAGUES = ['superliga', '1-division']
const SETTLE = 15 * 60_000
const WINDOW = 8 * 3_600_000

interface Seen {
  /** When the match was first seen finished */
  finishedAt: number
  /** When James was asked to write it */
  requestedAt?: number
  /** The draft he wrote */
  articleId?: number
}

interface State {
  matches: Record<string, Seen>
}

const file = () => path.join(/*turbopackIgnore: true*/ cacheDir(), 'data', 'hurtige-referater.json')
const requestFile = () => path.join(/*turbopackIgnore: true*/ cacheDir(), 'data', 'referat-request')

function readState(): State {
  try {
    const s = JSON.parse(readFileSync(file(), 'utf8')) as Partial<State>
    return { matches: s.matches ?? {} }
  } catch {
    return { matches: {} }
  }
}

function saveState(state: State, now: number) {
  // Two days are plenty: older matches are past the window anyway
  for (const [slug, s] of Object.entries(state.matches)) if (now - s.finishedAt > 2 * 86_400_000) delete state.matches[slug]
  mkdirSync(path.dirname(file()), { recursive: true })
  writeFileSync(file(), JSON.stringify(state, null, 2))
}

/** The finished men's Superliga and 1. division matches that kicked off in the last 8 hours */
function finishedMatches(now: number): Match[] {
  const days = new Set([isoDate(new Date(now)), isoDate(new Date(now - WINDOW))])
  return [...days]
    .flatMap((d) => getMatches(d, 'soccer', now))
    .filter((m) => FAST_REPORT_LEAGUES.includes(m.leagueSlug ?? '') && m.state === 'finished' && m.home.score != null && m.away.score != null && !isWomenMatch(m) && now - m.kickoff.getTime() < WINDOW)
}

export interface FastReportMatch {
  slug: string
  league: string
  kickoff: string
  round?: number
  venue?: string
  home: string
  away: string
  hs: number
  as: number
  /** Goals and cards in match order: minute, side, kind, player */
  incidents: { minute: number; side: 'home' | 'away'; kind: string; player?: string }[]
  matchPage: string
}

/** The matches James should write a report on now (finished at least 15 minutes ago, not written yet) */
export function pendingFastReports(now = Date.now()): FastReportMatch[] {
  const state = readState()
  return finishedMatches(now)
    .filter((m) => {
      const s = state.matches[m.slug]
      return s && !s.articleId && now - s.finishedAt >= SETTLE
    })
    .map((m) => ({
      slug: m.slug,
      league: m.league,
      kickoff: m.kickoff.toISOString(),
      round: m.round,
      venue: m.venue,
      home: m.home.name,
      away: m.away.name,
      hs: m.home.score!,
      as: m.away.score!,
      incidents: (m.incidents ?? []).map((i) => ({ minute: i.minute, side: i.side, kind: i.kind, player: i.player })),
      matchPage: `/kamp/${m.slug}`,
    }))
}

/** The report draft James wrote for the match (to publish it himself – only his fast reports) */
export function fastReportArticle(slug: string): number | undefined {
  return readState().matches[slug]?.articleId || undefined
}

/** James has written the report (or found it not worth one: articleId 0) */
export function markFastReport(slug: string, articleId: number): { error?: string } {
  const state = readState()
  const s = state.matches[slug]
  if (!s) return { error: 'Kampen er ikke på listen over færdige kampe' }
  s.articleId = articleId
  saveState(state, Date.now())
  return {}
}

/** Notes newly finished matches and asks the server to start James when one has settled */
export function checkFastReports(now = Date.now()): number {
  const state = readState()
  let changed = false
  let ask = 0
  for (const m of finishedMatches(now)) {
    const s = state.matches[m.slug]
    if (!s) {
      state.matches[m.slug] = { finishedAt: now }
      changed = true
    } else if (!s.requestedAt && !s.articleId && now - s.finishedAt >= SETTLE) {
      s.requestedAt = now
      changed = true
      ask++
    }
  }
  if (ask) writeFileSync(requestFile(), `${new Date(now).toISOString()}\n`)
  if (changed) saveState(state, now)
  return ask
}

let started = false

export function startFastReports() {
  if (started || process.env.FAST_REPORTS === 'off') return
  started = true
  const tick = () => {
    try {
      checkFastReports()
    } catch {
      // next time
    }
  }
  setTimeout(tick, 2 * 60_000).unref?.()
  setInterval(tick, 5 * 60_000).unref?.()
}
