import type { Match, SportFilter, SportId } from '../types'
import { addDays } from '../lib/time'
import { clubFixtures, fixturesOn, seasonClub, toMatch } from './season'
import { getRealData } from './real'
import { externalToMatch, gameKey, type ExternalGame } from './external'
import { SEARCH_NAMES, alike } from './aliases'
import { divisionOfGame } from './ourLeagues'
import { cupOfGame, ourClubInCup } from './cups'
import { isoDate } from '../lib/time'

/** An API-Sports game as a match, placed in our league when it is one of ours (and with our clubs' names in a cup) */
export function externalMatch(g: ExternalGame): Match {
  const cup = cupOfGame(g)
  if (cup) {
    const home = ourClubInCup(g.home.name, cup)?.club
    const away = ourClubInCup(g.away.name, cup)?.club
    if (home || away) {
      const renamed = { ...g, home: home ? { ...g.home, name: home.name, logo: undefined } : g.home, away: away ? { ...g.away, name: away.name, logo: undefined } : g.away }
      const m = externalToMatch(renamed)
      return { ...m, home: { ...m.home, colors: home?.colors }, away: { ...m.away, colors: away?.colors } }
    }
  }
  const m = externalToMatch(g)
  const ours = divisionOfGame(g)
  if (!ours) return m
  const { d, i } = ours
  return { ...m, league: d.name, leagueId: `${d.countryCode.toLowerCase()}-${d.id}`, leagueSlug: d.slug, leagueOrder: i, country: d.country }
}

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
  const taken = new Set<number>()
  const names = ours.map((m) => ({ home: namesOf(m.home.name), away: namesOf(m.away.name) }))
  for (const g of external) {
    let i = byKey.get(gameKey(g.kickoff, g.home.name, g.away.name))
    // Names written differently ("Holbæk B and I" / "Holbæk B&I"): same day and each side shares a word
    if (i === undefined) {
      const loose = ours.flatMap((_, j) =>
        !taken.has(j) && alike(names[j].home, g.home.name) && alike(names[j].away, g.away.name) ? [j] : [],
      )
      if (loose.length === 1) i = loose[0]
    }
    if (i !== undefined) taken.add(i)
    if (i === undefined) {
      extra.push(g)
      continue
    }
    // Same match: API-Sports' live state and score win until our source has the final result
    const m = ours[i]
    // Goals and cards from API-Sports where our source has none
    if (!m.incidents?.length && g.incidents?.length) ours[i] = { ...m, incidents: g.incidents }
    const oursFinal = m.state === 'finished' && m.home.score !== undefined
    if (!oursFinal && (g.state === 'live' || g.state === 'finished') && g.homeScore !== undefined && g.awayScore !== undefined) {
      const x = externalToMatch(g)
      ours[i] = { ...m, state: x.state, statusLabel: x.statusLabel, winner: x.winner, home: { ...m.home, score: g.homeScore }, away: { ...m.away, score: g.awayScore } }
    }
  }
  return [...ours, ...extra.map(externalMatch)]
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
  if (!club) return []
  const league = clubFixtures(club.club.id).map((f) => toMatch(f, now))
  // Its cup games
  const cup = (getRealData()?.external ?? [])
    .filter((g) => cupOfGame(g))
    .map(externalMatch)
    .filter((m) => m.home.name === club.club.name || m.away.name === club.club.name)
  return cup.length ? [...league, ...cup].sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime()) : league
}

/** Matches for any team (any sport) over a range of days from `fromDate` */
export function teamMatches(teamName: string | string[], sport: SportId, fromDate: string, days: number, now: number, leagueSlug?: string): Match[] {
  const names = new Set(Array.isArray(teamName) ? teamName : [teamName])
  const out: Match[] = []
  for (let i = 0; i < days; i++) {
    const d = new Date(`${fromDate}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() + i)
    const date = d.toISOString().slice(0, 10)
    for (const m of getMatches(date, sport, now)) {
      // In the team's own league when given: a women's team can share its name with the men's club
      if ((names.has(m.home.name) || names.has(m.away.name)) && (!leagueSlug || m.leagueSlug === leagueSlug)) out.push(m)
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

/** API-Sports' own record of a match (ours or theirs), for lookups such as head-to-head */
export function findExternalGame(match: Match): ExternalGame | undefined {
  const external = getRealData()?.external ?? []
  const direct = external.find((g) => g.id === match.id)
  if (direct) return direct
  const keys = new Set(namesOf(match.home.name).flatMap((h) => namesOf(match.away.name).map((a) => gameKey(match.kickoff, h, a))))
  const exact = external.find((g) => g.sport === match.sport && keys.has(gameKey(g.kickoff, g.home.name, g.away.name)))
  if (exact) return exact
  // Looser: same day and sport, and each side shares a word with one of the club's names ("HIK" / "Hellerup IK")
  const day = isoDate(match.kickoff)
  const home = namesOf(match.home.name)
  const away = namesOf(match.away.name)
  const candidates = external.filter(
    (g) => g.sport === match.sport && isoDate(new Date(g.kickoff)) === day && alike(home, g.home.name) && alike(away, g.away.name),
  )
  return candidates.length === 1 ? candidates[0] : undefined
}
