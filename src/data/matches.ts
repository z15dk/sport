import type { Match, SportFilter, SportId } from '../types'
import { addDays } from '../lib/time'
import { clubFixtures, fixturesOn, seasonClub, toMatch } from './season'
import { getRealData } from './real'
import { externalToMatch, gameKey, type ExternalGame } from './external'
import { SEARCH_NAMES } from './aliases'
import { isoDate } from '../lib/time'

// Matches for the front page, match pages and club pages, all from the
// real season in season.ts.

/** Matches from the full league seasons (football, ice hockey, basketball) */
function leagueMatches(date: string, sport: SportId, now: number): Match[] {
  return fixturesOn(date)
    .filter((f) => f.sport === sport)
    .map((f) => toMatch(f, now))
}

const ALL_SPORTS: SportId[] = ['soccer', 'basketball', 'ice_hockey', 'handball', 'volleyball', 'american_football']

/** The names a club goes by (ours, TheSportsDB's, search aliases), for matching games across sources */
function namesOf(name: string) {
  const club = seasonClub(name)?.club
  return [name, club?.originalName, club?.apiName, club && SEARCH_NAMES[club.id]].filter((n): n is string => !!n)
}

/**
 * The day's matches: our leagues' season, updated with API-Sports' live score
 * where API-Sports has the same match, plus API-Sports' games in other leagues.
 */
export function getMatches(date: string, sport: SportFilter, now: number): Match[] {
  if (sport === 'all') return ALL_SPORTS.flatMap((s) => getMatches(date, s, now))
  const ours = leagueMatches(date, sport, now)
  const external = (getRealData()?.external ?? []).filter((g) => g.sport === sport && isoDate(new Date(g.kickoff)) === date)
  if (!external.length) return ours
  const byKey = new Map<string, number>()
  ours.forEach((m, i) => {
    for (const h of namesOf(m.home.name)) for (const a of namesOf(m.away.name)) byKey.set(gameKey(m.kickoff, h, a), i)
  })
  const extra: ExternalGame[] = []
  for (const g of external) {
    const i = byKey.get(gameKey(g.kickoff, g.home.name, g.away.name))
    if (i === undefined) {
      extra.push(g)
      continue
    }
    // Same match: API-Sports' live state and score win until our source has the final result
    const m = ours[i]
    const oursFinal = m.state === 'finished' && m.home.score !== undefined
    if (!oursFinal && (g.state === 'live' || g.state === 'finished') && g.homeScore !== undefined && g.awayScore !== undefined) {
      const x = externalToMatch(g)
      ours[i] = { ...m, state: x.state, statusLabel: x.statusLabel, winner: x.winner, home: { ...m.home, score: g.homeScore }, away: { ...m.away, score: g.awayScore } }
    }
  }
  return [...ours, ...extra.map(externalToMatch)]
}


export function findMatch(slug: string, date: string, now: number): Match | undefined {
  for (const sport of ALL_SPORTS) {
    const m = getMatches(date, sport, now).find((x) => x.slug === slug)
    if (m) return m
  }
  return undefined
}

/** Every match of a league club this season, in date order */
export function clubMatches(clubName: string, now: number): Match[] {
  const club = seasonClub(clubName)
  return club ? clubFixtures(club.club.id).map((f) => toMatch(f, now)) : []
}

/** Matches for any team (any sport) over a range of days from `fromDate` */
export function teamMatches(teamName: string, sport: SportId, fromDate: string, days: number, now: number): Match[] {
  const out: Match[] = []
  for (let i = 0; i < days; i++) {
    const d = new Date(`${fromDate}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() + i)
    const date = d.toISOString().slice(0, 10)
    for (const m of getMatches(date, sport, now)) {
      if (m.home.name === teamName || m.away.name === teamName) out.push(m)
    }
  }
  return out
}

/** The next `limit` matches that have not started, within `days` days from `now` (all sources) */
export function upcomingMatches(sport: SportFilter, today: string, now: number, days = 10, limit = 8): Match[] {
  const until = now + days * 86_400_000
  return Array.from({ length: days + 1 }, (_, i) => getMatches(addDays(today, i), sport, now))
    .flat()
    .filter((m) => m.state === 'upcoming' && m.kickoff.getTime() > now && m.kickoff.getTime() <= until)
    .sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime())
    .slice(0, limit)
}

/** The nearest day after (or before) `date` with matches, looking up to 60 days away */
export function nearestMatchDay(date: string, sport: SportFilter, direction: 1 | -1, now: number): string | undefined {
  for (let i = 1; i <= 60; i++) {
    const d = addDays(date, i * direction)
    if (getMatches(d, sport, now).length) return d
  }
  return undefined
}
