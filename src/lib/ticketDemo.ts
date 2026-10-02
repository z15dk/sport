import 'server-only'
import { allFixtures, isFinished, toMatch } from '../data/season'
import { findMatch } from '../data/matches'
import { findClub } from '../data/matchInsights'
import type { Match } from '../types'
import type { Club } from '../data/club'

// The demo's matches (src/lib/ticketShop.ts): real coming home matches of the Danish football clubs we cover.

/** The coming home matches the demo sells tickets to, soonest first */
export function demoMatches(now = Date.now(), limit = 40): Match[] {
  return allFixtures()
    .filter((f) => f.division?.countryCode === 'DK' && f.sport === 'soccer' && !isFinished(f) && f.kickoff.getTime() > now + 30 * 60_000 && f.kickoff.getTime() < now + 45 * 86_400_000)
    .sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime())
    .slice(0, limit)
    .map((f) => toMatch(f, now))
}

/** A coming match the demo can sell tickets to, by its page's slug */
export function demoMatch(slug: string, now = Date.now()): Match | undefined {
  const date = /(\d{4}-\d{2}-\d{2})$/.exec(slug)?.[1]
  const m = date ? findMatch(slug, date, now) : undefined
  if (!m || m.state !== 'upcoming' || !findClub(m.home.name)) return undefined
  return m
}

export interface DemoClub {
  club: Club
  /** The club's coming home matches in the demo, soonest first */
  matches: Match[]
}

/** The clubs selling (demo) tickets: every home club among the demo's matches, by name */
export function demoClubs(now = Date.now()): DemoClub[] {
  const out = new Map<string, DemoClub>()
  for (const m of demoMatches(now)) {
    const c = findClub(m.home.name)?.club
    if (!c) continue
    const have = out.get(c.id) ?? { club: c, matches: [] }
    have.matches.push(m)
    out.set(c.id, have)
  }
  return [...out.values()].sort((a, b) => a.club.name.localeCompare(b.club.name, 'da'))
}

/** One club in the demo by its slug */
export function demoClub(slug: string, now = Date.now()): DemoClub | undefined {
  return demoClubs(now).find((c) => c.club.slug === slug)
}
