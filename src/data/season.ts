import type { Incident, Match, MatchState } from '../types'
import type { SportId } from '../types'
import { getRealData, type RealData } from './real'
import { SEARCH_NAMES, alike, normalize } from './aliases'
import { DIVISIONS, renameClubs, renameLeagues, sportOf, type Club, type Division } from './leagues'
import { hashString } from './fixtures'
import { GAME_LENGTH_MIN, type Extra } from './scoring'
import { matchSlug, slugify } from '../lib/slug'
import { isoDate } from '../lib/time'

// The season for every league we list, built from the real fixtures and
// results TheSportsDB has (src/data/real.ts). Tables, club pages and the front
// page all read from here. Leagues without real fixtures have no matches.

export interface Fixture {
  id: string
  slug: string
  competition: string
  leagueId: string
  leagueSlug?: string
  leagueOrder: number
  round: number
  sport: SportId
  division?: Division
  home: Club
  away: Club
  kickoff: Date
  /** Final score (0-0 until there is one) */
  score: [number, number]
  /** Ice hockey / basketball games decided in overtime or a shootout */
  extra?: Extra
  /** TheSportsDB's state for the fixture */
  real: { state: MatchState; progress?: string; hasScore: boolean }
  incidents?: Incident[]
  ht?: [number, number]
  spectators?: number
}

// ---------------------------------------------------------------- real fixtures

/** Finds our club for a TheSportsDB team name; clubs we do not know get a stand-in */
const REGISTER_SLUGS = new Set(DIVISIONS.flatMap((d) => d.clubs.map((c) => c.slug)))

function clubResolver(div: Division, names: Record<string, string>) {
  const byName = new Map<string, Club>()
  const candidates = DIVISIONS.filter((d) => d.countryCode === div.countryCode && sportOf(d) === sportOf(div)).flatMap((d) => d.clubs)
  // The division's own clubs first, so they win a shared name
  for (const club of [...div.clubs, ...candidates]) {
    for (const n of [club.name, club.originalName, club.apiName, SEARCH_NAMES[club.id]]) {
      const key = n && normalize(n)
      if (key && !byName.has(key)) byName.set(key, club)
    }
  }
  const unknown = new Map<string, Club>()
  const seen = new Map<string, Club>()
  return (name: string): Club => {
    const hit = seen.get(name)
    if (hit) return hit
    const club = find(name)
    seen.set(name, club)
    return club
  }
  function find(name: string): Club {
    const key = normalize(name)
    const found =
      byName.get(key) ??
      [...byName.entries()].find(([n]) => ` ${key} `.includes(` ${n} `) || ` ${n} `.includes(` ${key} `))?.[1]
    if (found) return found
    // Written differently ("HV 71", "Djurgarden", "Linköpings HC"): one of the league's clubs alone matches loosely
    const loose = [...new Set(div.clubs.filter((c) => alike([c.name, c.originalName, c.apiName, SEARCH_NAMES[c.id]].filter((n): n is string => !!n), name)))]
    if (loose.length === 1) return loose[0]
    if (!unknown.has(name)) {
      // A club missing from our register (e.g. just promoted) still gets a page
      let slug = slugify(name)
      if (REGISTER_SLUGS.has(slug)) slug = `${slug}-${slugify(div.country)}`
      unknown.set(name, { id: `x-${hashString(name).toString(36)}`, slug, name: names[slug] ?? name, originalName: name, city: '', colors: ['#5c6157', '#ffffff'] })
    }
    return unknown.get(name)!
  }
}

function buildReal(real: RealData): Fixture[] {
  const out: Fixture[] = []
  for (const [divisionId, events] of Object.entries(real.leagues)) {
    const di = DIVISIONS.findIndex((d) => d.id === divisionId)
    if (di < 0 || events.length === 0) continue
    const div = DIVISIONS[di]
    const club = clubResolver(div, real.clubNames ?? {})
    for (const e of events) {
      const home = club(e.home)
      const away = club(e.away)
      const kickoff = new Date(e.kickoff)
      const hasScore = e.homeScore !== undefined && e.awayScore !== undefined
      out.push({
        id: `tsdb-${e.id}`,
        slug: matchSlug(home.name, away.name, isoDate(kickoff)),
        competition: div.name,
        leagueId: `${div.countryCode.toLowerCase()}-${div.id}`,
        leagueSlug: div.slug,
        leagueOrder: di,
        round: e.round,
        sport: sportOf(div),
        division: div,
        home,
        away,
        kickoff,
        score: [e.homeScore ?? 0, e.awayScore ?? 0],
        real: { state: e.state, progress: e.progress, hasScore },
        incidents: e.incidents,
        ht: e.ht,
        spectators: e.spectators,
      })
    }
  }
  return out
}

// ---------------------------------------------------------------- the season

interface Season {
  version?: string
  fixtures: Fixture[]
  byDate: Map<string, Fixture[]>
  realDivisions: Set<string>
  clubs: { club: Club; division: Division }[]
}
let season: Season | undefined

/** The season from the real data; rebuilt when the real data changes */
function current(): Season {
  const real = getRealData()
  if (season && season.version === real?.version) return season
  // Names changed in the admin pages, before anything is built from the clubs
  renameClubs(real?.clubNames ?? {})
  renameLeagues(real?.leagueNames ?? {})
  const realDivisions = new Set(Object.entries(real?.leagues ?? {}).filter(([, e]) => e.length > 0).map(([id]) => id))
  const fixtures = (real ? buildReal(real) : []).sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime())
  const byDate = new Map<string, Fixture[]>()
  for (const f of fixtures) {
    const d = isoDate(f.kickoff)
    byDate.set(d, [...(byDate.get(d) ?? []), f])
  }
  // Every club playing, with the league it actually plays in this season
  const clubs = new Map<string, { club: Club; division: Division }>()
  for (const f of fixtures) {
    if (!f.division) continue
    for (const club of [f.home, f.away]) if (!clubs.has(club.id)) clubs.set(club.id, { club, division: f.division })
  }
  season = { version: real?.version, fixtures, byDate, realDivisions, clubs: [...clubs.values()] }
  return season
}

/** Every club playing in a league we show, with that league */
export const seasonClubs = () => current().clubs
/** The club with this name in this season's leagues */
export const seasonClub = (name: string) => current().clubs.find((x) => x.club.name === name)

export const allFixtures = () => current().fixtures
export const fixturesOn = (date: string) => current().byDate.get(date) ?? []
export const clubFixtures = (clubId: string) => current().fixtures.filter((f) => f.home.id === clubId || f.away.id === clubId)
/** Whether a club has real matches in a division this season (then its division is confirmed) */
export const playsIn = (clubId: string, divisionId: string) =>
  current().fixtures.some((f) => f.division?.id === divisionId && (f.home.id === clubId || f.away.id === clubId))
/** Our register's "unverified" mark, only while the real matches don't confirm the division */
export const isUnconfirmed = (club: { id: string; unverified?: boolean }, divisionId: string) => !!club.unverified && !playsIn(club.id, divisionId)
/** Leagues shown with real data, with their next match after `now` (for the front page) */
export function realLeagues(now: number): { division: Division; next?: Fixture }[] {
  const { fixtures, realDivisions } = current()
  return DIVISIONS.filter((d) => realDivisions.has(d.id)).map((division) => ({
    division,
    next: fixtures.find((f) => f.division === division && f.real && f.kickoff.getTime() > now && f.real.state !== 'postponed'),
  }))
}

/** True when the division shows real fixtures and results */
export const isRealDivision = (div: Division) => current().realDivisions.has(div.id)
export const isFinished = (f: Fixture) => f.real.state === 'finished' && f.real.hasScore

/** Status and score of a real fixture: TheSportsDB's own state, but live once kick-off has passed */
function realState(f: Fixture, now: number): { state: MatchState; statusLabel?: string; hasScore: boolean } {
  const r = f.real
  if (r.state === 'finished') return { state: 'finished', statusLabel: 'Slut', hasScore: r.hasScore }
  if (r.state === 'postponed') return { state: 'postponed', statusLabel: 'Udsat', hasScore: false }
  // Hours after it should have ended and still no result: not live, and no score we can vouch for
  if (now > f.kickoff.getTime() + 5 * 3_600_000) return { state: 'postponed', statusLabel: 'Intet resultat', hasScore: false }
  if (r.state === 'live') {
    const p = r.progress ?? ''
    return { state: 'live', statusLabel: p === 'HT' ? 'Pause' : /^\d+$/.test(p) ? `${p}'` : 'Live', hasScore: r.hasScore }
  }
  if (now >= f.kickoff.getTime()) {
    const over = now > f.kickoff.getTime() + (GAME_LENGTH_MIN[f.sport] + 15) * 60000
    return { state: 'live', statusLabel: over ? 'Afventer' : 'I gang', hasScore: r.hasScore }
  }
  return { state: 'upcoming', hasScore: false }
}

/** Turns a fixture into a match as it looks at `now` (upcoming, live with a partial score, or finished) */
export function toMatch(f: Fixture, now: number): Match {
  const { state, statusLabel, hasScore } = realState(f, now)
  return {
    ...baseMatch(f),
    real: true,
    incidents: state === 'upcoming' ? undefined : f.incidents,
    state,
    statusLabel,
    winner: state !== 'finished' ? undefined : f.score[0] > f.score[1] ? 'home' : f.score[0] < f.score[1] ? 'away' : 'draw',
    home: { name: f.home.name, colors: f.home.colors, score: hasScore ? f.score[0] : undefined },
    away: { name: f.away.name, colors: f.away.colors, score: hasScore ? f.score[1] : undefined },
  }
}

function baseMatch(f: Fixture) {
  return {
    id: f.id,
    slug: f.slug,
    sport: f.sport,
    league: f.competition,
    leagueId: f.leagueId,
    leagueSlug: f.leagueSlug,
    leagueOrder: f.leagueOrder,
    country: f.division?.country ?? 'Danmark',
    kickoff: f.kickoff,
    venue: f.home.city || undefined,
    round: f.round,
  }
}

export interface StandingRow {
  club: Club
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  points: number
  /** Ice hockey / basketball: wins and losses after overtime or a shootout (also counted in won/lost) */
  otWon: number
  otLost: number
  /** Results in the order they were played */
  form: ('V' | 'U' | 'T')[]
}

/** Table for a division from every finished league match */
export function standings(div: Division, _now?: number): StandingRow[] {
  const { fixtures, realDivisions } = current()
  // The clubs that actually play in the league this season
  const clubs = realDivisions.has(div.id)
    ? [...new Map(fixtures.filter((f) => f.division === div).flatMap((f) => [f.home, f.away]).map((c) => [c.id, c])).values()]
    : []
  const rows = new Map<string, StandingRow>(
    clubs.map((club) => [
      club.id,
      { club, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0, otWon: 0, otLost: 0, form: [] },
    ]),
  )
  const sport = sportOf(div)
  // Ice hockey: 3 for a win in regulation, 2 after overtime/shootout, 1 for losing after it.
  // Basketball: 2 per win. Football: 3 for a win, 1 for a draw.
  const winPts = sport === 'basketball' ? 2 : 3
  const result = (row: StandingRow, f: number, a: number, extra?: Extra) => {
    row.played++
    row.goalsFor += f
    row.goalsAgainst += a
    if (f > a) {
      row.won++
      row.points += sport === 'ice_hockey' && extra ? 2 : winPts
      if (extra) row.otWon++
      row.form.push('V')
    } else if (f < a) {
      row.lost++
      if (extra) {
        row.otLost++
        if (sport === 'ice_hockey') row.points += 1
      }
      row.form.push('T')
    } else {
      row.drawn++
      row.points++
      row.form.push('U')
    }
  }
  for (const f of fixtures) {
    if (f.division !== div || !isFinished(f)) continue
    result(rows.get(f.home.id)!, f.score[0], f.score[1], f.extra)
    result(rows.get(f.away.id)!, f.score[1], f.score[0], f.extra)
  }
  return [...rows.values()].sort(
    (x, y) =>
      y.points - x.points ||
      y.goalsFor - y.goalsAgainst - (x.goalsFor - x.goalsAgainst) ||
      y.goalsFor - x.goalsFor ||
      x.club.name.localeCompare(y.club.name, 'da'),
  )
}
