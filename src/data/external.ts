import type { Incident, Match, MatchState, SportId } from '../types'
import { matchSlug, slugify } from '../lib/slug'
import { isoDate } from '../lib/time'
import { normalize } from './aliases'

// Games from API-Sports (football, basketball, NBA, ice hockey, handball,
// volleyball, NFL). The server job (src/lib/apisports.ts) fetches them day by
// day and hands them to the browser with the rest of the real data.

export interface ExternalGame {
  /** "<api>-<id>", e.g. "football-1035037" */
  id: string
  sport: SportId
  league: { id: string; name: string; country?: string; logo?: string; season?: string; /** Before a rename in the admin pages */ originalName?: string }
  home: { name: string; logo?: string; id?: number }
  away: { name: string; logo?: string; id?: number }
  /** ISO timestamp */
  kickoff: string
  state: MatchState
  /** Minute or period while live, e.g. "67'", "Q3", "Pause" */
  label?: string
  homeScore?: number
  awayScore?: number
  venue?: string
  /** Stadium name, when the city is in venue */
  stadium?: string
  round?: string
  referee?: string
  /** Half-time score */
  ht?: [number, number]
  /** Goals and cards, when the source has them */
  incidents?: Incident[]
  /** What the goals and cards were fetched for ("state|score"), so they are fetched again when it changes */
  eventsFor?: string
}

/**
 * A round's name in Danish: "3rd Round" and "Round 3" -> "3. runde",
 * "Regular Season - 9" -> "9. runde", "Round of 16" and "1/8-finals" ->
 * "Ottendedelsfinale", "Quarter-finals" -> "Kvartfinale" and so on.
 */
export function danishRound(round?: string | number): string | undefined {
  if (round === undefined || round === null || round === '') return undefined
  const r = String(round).trim()
  if (/^\d+$/.test(r)) return `${r}. runde`
  const stage = /^(.*?)\s*-\s*(\d+)$/.exec(r)
  const stages: Record<string, string> = { 'regular season': '', 'league stage': 'Ligafase, ', 'group stage': 'Gruppespil, ', qualifying: 'Kvalifikation, ' }
  if (stage && stage[1].toLowerCase() in stages) return `${stages[stage[1].toLowerCase()]}${stage[2]}. runde`
  const lower = r.toLowerCase()
  const finals: [RegExp, string][] = [
    [/semi/, 'Semifinale'],
    [/quarter|1\/4|round of 8\b/, 'Kvartfinale'],
    [/1\/8|8th final|round of 16/, 'Ottendedelsfinale'],
    [/1\/16|16th final|round of 32/, '1/16-finale'],
    [/1\/32|round of 64/, '1/32-finale'],
    [/3rd place|third place|bronze/, 'Bronzekamp'],
  ]
  for (const [re, name] of finals) if (re.test(lower)) return name
  if (/^finals?$/.test(lower)) return 'Finale'
  if (/preliminary/.test(lower)) return 'Indledende runde'
  const n = /(\d+)(?:st|nd|rd|th)?\s*round|round\s*(\d+)/.exec(lower)
  if (n) return `${n[1] ?? n[2]}. runde`
  if (/qualif/.test(lower)) return 'Kvalifikation'
  return r
}

/**
 * The key an API-Sports league (not one of ours) goes by: its page
 * (/turnering/<key>), its logo and its name in the admin pages. From the
 * original name, so a rename keeps the key.
 */
export const externalLeagueKey = (league: { name: string; country?: string; originalName?: string }) =>
  `x-${slugify(`${league.country ?? ''} ${league.originalName ?? league.name}`)}`

/** Same date and the same two teams (by normalised name) */
export const gameKey = (kickoff: string | Date, home: string, away: string) =>
  `${isoDate(typeof kickoff === 'string' ? new Date(kickoff) : kickoff)}|${normalize(home)}|${normalize(away)}`

export function externalToMatch(g: ExternalGame): Match {
  const kickoff = new Date(g.kickoff)
  const hasScore = g.state !== 'upcoming' && g.homeScore !== undefined && g.awayScore !== undefined
  return {
    id: g.id,
    slug: matchSlug(g.home.name, g.away.name, isoDate(kickoff)),
    sport: g.sport,
    league: g.league.name,
    leagueId: `ext-${g.id.split('-')[0]}-${g.league.id}`,
    leagueOrder: 50,
    country: g.league.country,
    leagueBadge: g.league.logo,
    leagueSlug: externalLeagueKey(g.league),
    kickoff,
    state: g.state,
    statusLabel: g.state === 'finished' ? 'Slut' : g.state === 'postponed' ? 'Udsat' : g.label,
    venue: g.venue,
    real: true,
    ...(g.incidents?.length && { incidents: g.incidents }),
    winner:
      g.state !== 'finished' || !hasScore
        ? undefined
        : g.homeScore! > g.awayScore!
          ? 'home'
          : g.homeScore! < g.awayScore!
            ? 'away'
            : 'draw',
    home: { name: g.home.name, badge: g.home.logo, score: hasScore ? g.homeScore : undefined },
    away: { name: g.away.name, badge: g.away.logo, score: hasScore ? g.awayScore : undefined },
  }
}
