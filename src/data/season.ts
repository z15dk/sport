import type { Match, MatchState } from '../types'
import type { SportId } from '../types'
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

const FIXTURES = [...buildLeague(), ...buildCup()].sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime())
const BY_DATE = new Map<string, Fixture[]>()
for (const f of FIXTURES) {
  const d = isoDate(f.kickoff)
  BY_DATE.set(d, [...(BY_DATE.get(d) ?? []), f])
}

export const allFixtures = () => FIXTURES
export const fixturesOn = (date: string) => BY_DATE.get(date) ?? []
export const clubFixtures = (clubId: string) => FIXTURES.filter((f) => f.home.id === clubId || f.away.id === clubId)
export const isFinished = (f: Fixture, now: number) => f.kickoff.getTime() + GAME_LENGTH_MIN[f.sport] * 60000 <= now

/** Turns a fixture into a match as it looks at `now` (upcoming, live with a partial score, or finished) */
export function toMatch(f: Fixture, now: number): Match {
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
    id: f.id,
    slug: f.slug,
    sport: f.sport,
    league: f.competition,
    leagueId: f.leagueId,
    leagueSlug: f.leagueSlug,
    leagueOrder: f.leagueOrder,
    country: f.division?.country ?? 'Danmark',
    kickoff: f.kickoff,
    state,
    statusLabel,
    venue: f.home.city,
    round: f.round,
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
  const rows = new Map<string, StandingRow>(
    div.clubs.map((club) => [
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
  for (const f of FIXTURES) {
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
