import type { Match, SportId } from '../types'
import { clubFixtures, fixturesOn, seasonClub, toMatch } from './season'

// Matches for the front page, match pages and club pages, all from the
// real season in season.ts.

/** Matches from the full league seasons (football, ice hockey, basketball) */
function leagueMatches(date: string, sport: SportId, now: number): Match[] {
  return fixturesOn(date)
    .filter((f) => f.sport === sport)
    .map((f) => toMatch(f, now))
}

export function getMatches(date: string, sport: SportId, now: number): Match[] {
  return leagueMatches(date, sport, now)
}

const ALL_SPORTS: SportId[] = ['soccer', 'basketball', 'ice_hockey']

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
