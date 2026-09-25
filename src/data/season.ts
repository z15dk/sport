import type { Match, MatchState } from '../types'
import type { SportId } from '../types'
import { getRealData, type RealData } from './real'
import { SEARCH_NAMES, normalize } from './aliases'
import { DIVISIONS, sportOf, type Club, type Division } from './leagues'
import { hashString, poisson, roundRobin, seeded, shuffle } from './fixtures'
import { GAME_LENGTH_MIN, liveLabel, playGame, type Extra } from './scoring'
import { matchSlug } from '../lib/slug'
import { addDays, danishTime, isoDate } from '../lib/time'

// A fictional but consistent 2026/27 season for every league we cover: rounds
// on the league's own days from its start date, every pair meeting as often as
// the league prescribes, plus midweek rounds of the Danish football cup.
// Tables, club pages and the front page all read from here.

export const CUP_NAME = 'Pokalturneringen'

// Match slots per division as [days after the round's Friday, kickoff]. Spread
// over the week like the real leagues, so most days have football.
const SLOTS: Record<string, [number, string][]> = {
  superliga: [[0, '19:00'], [1, '15:00'], [1, '17:00'], [2, '14:00'], [2, '16:00'], [3, '19:00']],
  '1div': [[6, '18:30'], [0, '18:30'], [1, '13:00'], [1, '15:00'], [2, '13:00'], [2, '15:00']],
  '2div': [[3, '18:30'], [1, '13:00'], [1, '14:00'], [2, '12:00'], [2, '13:00'], [2, '14:00']],
  '3div': [[4, '19:00'], [1, '12:00'], [1, '13:00'], [1, '14:00'], [2, '13:00'], [2, '14:00']],
  premierleague: [[0, '21:00'], [1, '13:30'], [1, '16:00'], [1, '16:00'], [1, '16:00'], [1, '16:00'], [1, '18:30'], [2, '15:00'], [2, '15:00'], [2, '17:30']],
  championship: [[0, '21:00'], [1, '13:30'], [1, '16:00'], [1, '16:00'], [1, '16:00'], [1, '16:00'], [1, '16:00'], [1, '16:00'], [1, '16:00'], [1, '18:30'], [2, '13:00'], [2, '15:30']],
  allsvenskan: [[1, '15:00'], [1, '17:30'], [2, '15:00'], [2, '15:00'], [2, '17:30'], [3, '19:00'], [3, '19:00'], [0, '19:00']],
  eliteserien: [[1, '18:00'], [2, '17:00'], [2, '17:00'], [2, '17:00'], [2, '17:00'], [2, '19:15'], [3, '19:00'], [0, '19:00']],
  bundesliga: [[0, '20:30'], [1, '15:30'], [1, '15:30'], [1, '15:30'], [1, '15:30'], [1, '15:30'], [1, '18:30'], [2, '15:30'], [2, '17:30']],
  bundesliga2: [[0, '18:30'], [0, '18:30'], [1, '13:00'], [1, '13:00'], [1, '13:00'], [1, '20:30'], [2, '13:30'], [2, '13:30'], [2, '13:30']],
  liga3: [[0, '19:00'], [1, '14:00'], [1, '14:00'], [1, '14:00'], [1, '14:00'], [1, '16:30'], [2, '13:30'], [2, '13:30'], [2, '16:30'], [3, '19:00']],
  // Ice hockey and basketball play a whole round the same evening
  metalligaen: [[0, '19:00'], [0, '19:00'], [0, '19:30'], [0, '19:30']],
  shl: [[0, '15:15'], [0, '18:00'], [0, '19:00'], [0, '19:00'], [0, '19:00'], [0, '19:00'], [0, '19:00']],
  basketligaen: [[0, '19:00'], [0, '19:00'], [0, '19:00'], [0, '19:30'], [0, '20:00']],
}

// Cup rounds on Wednesdays, a day no league plays: 48 clubs -> 24 -> 12 -> 6
const CUP_ROUNDS = ['2026-08-26', '2026-09-23', '2026-10-21']

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
  /** Final score */
  score: [number, number]
  /** Cup ties that end level are settled on penalties */
  penaltyWinner?: 'home' | 'away'
  /** Ice hockey / basketball games decided in overtime or a shootout */
  extra?: Extra
  /** Set for real fixtures from TheSportsDB: their own state instead of the simulated clock */
  real?: { state: MatchState; progress?: string; hasScore: boolean }
}

// Placeholder that sits out a round in leagues with an odd number of clubs
const BYE = { id: '__bye__' } as Club

// The Danish cup has every club from the Danish football divisions
const CUP_DIVISIONS = DIVISIONS.filter((d) => d.countryCode === 'DK' && sportOf(d) === 'soccer')
const strengthRank = new Map<string, number>()
CUP_DIVISIONS.forEach((d, di) => d.clubs.forEach((c, ci) => strengthRank.set(c.id, di * 100 + ci)))

function buildLeague(): Fixture[] {
  const out: Fixture[] = []
  for (const [di, div] of DIVISIONS.entries()) {
    const sport = sportOf(div)
    const clubs = div.clubs.length % 2 ? [...div.clubs, BYE] : div.clubs
    const rounds = (div.meetings ?? 2) * (clubs.length - 1)
    const starts = div.roundStarts ?? [0]
    for (let round = 0; round < rounds; round++) {
      const roundDay = addDays(div.seasonStart, Math.floor(round / starts.length) * (div.cycleDays ?? 7) + starts[round % starts.length])
      const rand = seeded(hashString(`${div.id}-round-${round}`))
      const slots = shuffle(SLOTS[div.id], rand)
      const pairs = roundRobin(clubs, round).filter(([h, a]) => h !== BYE && a !== BYE)
      for (const [pi, [home, away]] of pairs.entries()) {
        const [dayOffset, time] = slots[pi % slots.length]
        const date = addDays(roundDay, dayOffset)
        const result = playGame(sport, div, home, away, rand)
        out.push({
          id: `${div.id}-r${round + 1}-${pi}`,
          slug: matchSlug(home.name, away.name, date),
          competition: div.name,
          leagueId: `${div.countryCode.toLowerCase()}-${div.id}`,
          leagueSlug: div.slug,
          leagueOrder: di,
          round: round + 1,
          sport,
          division: div,
          home,
          away,
          kickoff: danishTime(date, time),
          score: result.score,
          extra: result.extra,
        })
      }
    }
  }
  return out
}

function buildCup(): Fixture[] {
  const out: Fixture[] = []
  let remaining = CUP_DIVISIONS.flatMap((d) => d.clubs)
  for (const [ri, date] of CUP_ROUNDS.entries()) {
    const rand = seeded(hashString(`cup-${ri}`))
    const drawn = shuffle(remaining, rand)
    const winners: Club[] = []
    for (let i = 0; i + 1 < drawn.length; i += 2) {
      // The club from the lower division plays at home
      const [a, b] = [drawn[i], drawn[i + 1]]
      const [home, away] = strengthRank.get(a.id)! >= strengthRank.get(b.id)! ? [a, b] : [b, a]
      const diff = (strengthRank.get(home.id)! - strengthRank.get(away.id)!) / 100
      const score: [number, number] = [poisson(Math.max(0.5, 1.3 - diff * 0.35), rand), poisson(1.2 + diff * 0.35, rand)]
      let penaltyWinner: 'home' | 'away' | undefined
      if (score[0] === score[1]) penaltyWinner = rand() < 0.5 ? 'home' : 'away'
      const homeWon = score[0] > score[1] || penaltyWinner === 'home'
      winners.push(homeWon ? home : away)
      out.push({
        id: `cup-r${ri + 1}-${i / 2}`,
        slug: matchSlug(home.name, away.name, date),
        competition: CUP_NAME,
        leagueId: 'dk-cup',
        leagueOrder: CUP_DIVISIONS.length - 0.5,
        round: ri + 1,
        sport: 'soccer',
        home,
        away,
        kickoff: danishTime(date, ['18:00', '18:30', '19:00', '19:30'][i % 4]),
        score,
        penaltyWinner,
      })
    }
    remaining = winners
  }
  return out
}

// ---------------------------------------------------------------- real fixtures

/** Finds our club for a TheSportsDB team name; clubs we do not know get a stand-in */
function clubResolver(div: Division) {
  const byName = new Map<string, Club>()
  const candidates = DIVISIONS.filter((d) => d.countryCode === div.countryCode && sportOf(d) === sportOf(div)).flatMap((d) => d.clubs)
  // The division's own clubs first, so they win a shared name
  for (const club of [...div.clubs, ...candidates]) {
    for (const n of [club.name, club.apiName, SEARCH_NAMES[club.id]]) {
      const key = n && normalize(n)
      if (key && !byName.has(key)) byName.set(key, club)
    }
  }
  const unknown = new Map<string, Club>()
  return (name: string): Club => {
    const key = normalize(name)
    const found =
      byName.get(key) ??
      [...byName.entries()].find(([n]) => ` ${key} `.includes(` ${n} `) || ` ${n} `.includes(` ${key} `))?.[1]
    if (found) return found
    if (!unknown.has(name)) {
      unknown.set(name, { id: `x-${hashString(name).toString(36)}`, slug: '', name, city: '', colors: ['#5c6157', '#ffffff'] })
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
    const club = clubResolver(div)
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
      })
    }
  }
  return out
}

// ---------------------------------------------------------------- the season

const FICTIONAL = buildLeague()
const CUP = buildCup()

interface Season {
  version?: string
  fixtures: Fixture[]
  byDate: Map<string, Fixture[]>
  realDivisions: Set<string>
}
let season: Season | undefined

/** The season with real fixtures in place of the fictional ones where we have them; rebuilt when the real data changes */
function current(): Season {
  const real = getRealData()
  if (season && season.version === real?.version) return season
  const realDivisions = new Set(Object.entries(real?.leagues ?? {}).filter(([, e]) => e.length > 0).map(([id]) => id))
  const fixtures = [
    ...FICTIONAL.filter((f) => !f.division || !realDivisions.has(f.division.id)),
    ...(real ? buildReal(real) : []),
    ...CUP,
  ].sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime())
  const byDate = new Map<string, Fixture[]>()
  for (const f of fixtures) {
    const d = isoDate(f.kickoff)
    byDate.set(d, [...(byDate.get(d) ?? []), f])
  }
  season = { version: real?.version, fixtures, byDate, realDivisions }
  return season
}

export const allFixtures = () => current().fixtures
export const fixturesOn = (date: string) => current().byDate.get(date) ?? []
export const clubFixtures = (clubId: string) => current().fixtures.filter((f) => f.home.id === clubId || f.away.id === clubId)
/** True when the division shows real fixtures and results */
export const isRealDivision = (div: Division) => current().realDivisions.has(div.id)
export const isFinished = (f: Fixture, now: number) =>
  f.real ? f.real.state === 'finished' && f.real.hasScore : f.kickoff.getTime() + GAME_LENGTH_MIN[f.sport] * 60000 <= now

/** Status and score of a real fixture: TheSportsDB's own state, but live once kick-off has passed */
function realState(f: Fixture, now: number): { state: MatchState; statusLabel?: string; hasScore: boolean } {
  const r = f.real!
  if (r.state === 'finished') return { state: 'finished', statusLabel: 'Slut', hasScore: r.hasScore }
  if (r.state === 'postponed') return { state: 'postponed', statusLabel: 'Udsat', hasScore: false }
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
  if (f.real) {
    const { state, statusLabel, hasScore } = realState(f, now)
    return {
      ...baseMatch(f),
      real: true,
      state,
      statusLabel,
      winner: state !== 'finished' ? undefined : f.score[0] > f.score[1] ? 'home' : f.score[0] < f.score[1] ? 'away' : 'draw',
      home: { name: f.home.name, colors: f.home.colors, score: hasScore ? f.score[0] : undefined },
      away: { name: f.away.name, colors: f.away.colors, score: hasScore ? f.score[1] : undefined },
    }
  }
  const elapsed = (now - f.kickoff.getTime()) / 60000
  let state: MatchState = 'upcoming'
  let statusLabel: string | undefined
  let progress = 0
  const length = GAME_LENGTH_MIN[f.sport]
  if (elapsed > length) {
    state = 'finished'
    statusLabel = f.penaltyWinner || f.extra === 'so' ? 'Slut e.str.' : f.extra === 'ot' ? 'Slut e.f.' : 'Slut'
    progress = 1
  } else if (elapsed >= 0) {
    state = 'live'
    statusLabel = liveLabel(f.sport, elapsed)
    progress = Math.min(1, elapsed / length)
  }
  const hasScore = state !== 'upcoming'
  const partial = (g: number) => (state === 'finished' ? g : Math.floor(g * progress))
  return {
    ...baseMatch(f),
    state,
    statusLabel,
    winner:
      state !== 'finished'
        ? undefined
        : f.score[0] > f.score[1] || f.penaltyWinner === 'home'
          ? 'home'
          : f.score[0] < f.score[1] || f.penaltyWinner === 'away'
            ? 'away'
            : 'draw',
    home: { name: f.home.name, colors: f.home.colors, score: hasScore ? partial(f.score[0]) : undefined },
    away: { name: f.away.name, colors: f.away.colors, score: hasScore ? partial(f.score[1]) : undefined },
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

/** Table for a division from every league match finished by `now` */
export function standings(div: Division, now: number): StandingRow[] {
  const { fixtures, realDivisions } = current()
  // With real data the table also has any club playing that is missing from our register
  const clubs = realDivisions.has(div.id)
    ? [...new Map([...div.clubs, ...fixtures.filter((f) => f.division === div).flatMap((f) => [f.home, f.away])].map((c) => [c.id, c])).values()]
    : div.clubs
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
    if (f.division !== div || !isFinished(f, now)) continue
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
