import 'server-only'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { channelsFor } from '../data/channels'
import { getMatches } from '../data/matches'
import { articleById, type Article } from './articles'
import { danishCompetition } from './danishMatches'
import { fastReportArticle } from './fastReports'
import { addDays, isoDate } from './time'
import { cacheDir } from './tsdb'

// James' match previews (the owner's word 10/10-2026): every Danish match (src/lib/danishMatches.ts) gets a preview
// written by James with his own research (deploy/claude-editor/OPTAKT.md, matchly-optakt.timer morning and
// afternoon), published by himself – never on Facebook, and not in the article pages' lists (category "Kampoptakter",
// src/lib/articles.ts HIDDEN_CATEGORIES): on the match page, the clubs' and the league's pages and in Google.
// State (which match has which preview) in data/optakter.json.

/** How far ahead a match is written about: kick-off between 2 and 36 hours from now */
const AHEAD_FROM = 2 * 3_600_000
const AHEAD_TO = 36 * 3_600_000

interface Seen {
  competition?: string
  /** His preview (0: skipped, with why) */
  articleId?: number
  why?: string
  at?: number
}

const file = () => path.join(/*turbopackIgnore: true*/ cacheDir(), 'data', 'optakter.json')

function readState(): Record<string, Seen> {
  try {
    return (JSON.parse(readFileSync(file(), 'utf8')) as { matches?: Record<string, Seen> }).matches ?? {}
  } catch {
    return {}
  }
}

function saveState(matches: Record<string, Seen>) {
  // Matches more than a month old are forgotten
  const old = isoDate(Date.now() - 31 * 86_400_000)
  const kept = Object.fromEntries(Object.entries(matches).filter(([slug]) => (/(\d{4}-\d{2}-\d{2})$/.exec(slug)?.[1] ?? '9999') >= old))
  mkdirSync(path.dirname(file()), { recursive: true })
  writeFileSync(file(), JSON.stringify({ matches: kept }, null, 2))
}

export interface PreviewMatch {
  slug: string
  competition: string
  league: string
  kickoff: string
  round?: number
  venue?: string
  home: string
  away: string
  channels: string[]
  matchPage: string
}

/** The Danish matches James should write a preview for now (kick-off in 2–36 hours, none written yet) */
export function pendingPreviews(now = Date.now()): PreviewMatch[] {
  const state = readState()
  const today = isoDate(new Date(now))
  const days = [today, addDays(today, 1), addDays(today, 2)]
  const seen = new Set<string>()
  return days
    .flatMap((d) => getMatches(d, 'soccer', now))
    .filter((m) => {
      const ahead = m.kickoff.getTime() - now
      if (seen.has(m.slug) || ahead < AHEAD_FROM || ahead > AHEAD_TO || m.state !== 'upcoming' || !danishCompetition(m)) return false
      seen.add(m.slug)
      return state[m.slug]?.articleId === undefined
    })
    .sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime())
    .map((m) => ({
      slug: m.slug,
      competition: danishCompetition(m)!,
      league: m.league,
      kickoff: m.kickoff.toISOString(),
      round: m.round,
      venue: m.venue,
      home: m.home.name,
      away: m.away.name,
      channels: channelsFor(m).map((c) => c.name),
      matchPage: `/kamp/${m.slug}`,
    }))
}

/** James has written the preview (or skipped the match: articleId 0 with why) */
export function markPreview(slug: string, articleId: number, why?: string): { error?: string } {
  const state = readState()
  if (state[slug]?.articleId) return { error: 'Kampen har allerede en optakt' }
  state[slug] = { ...state[slug], articleId, why, at: Date.now() }
  saveState(state)
  return {}
}

/** The preview draft James wrote for a match (to publish it himself) */
export const previewArticle = (slug: string): number | undefined => readState()[slug]?.articleId || undefined

/** A match's published preview and report, for its match page */
export function matchArticles(slug: string): { preview?: Article; report?: Article } {
  const live = (id?: number) => {
    const a = id ? articleById(id) : undefined
    return a && a.status === 'published' && (!a.publishedAt || Date.parse(a.publishedAt) <= Date.now()) ? a : undefined
  }
  return { preview: live(previewArticle(slug)), report: live(fastReportArticle(slug)) }
}
