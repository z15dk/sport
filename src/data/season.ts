import type { Match, MatchState } from '../types'
import { DIVISIONS, type Club, type Division } from './leagues'
import { hashString, playMatch, poisson, roundRobin, seeded, shuffle } from './fixtures'
import { matchSlug } from '../lib/slug'
import { addDays, danishTime, isoDate } from '../lib/time'

// A fictional but consistent 2026/27 season for every league we cover: one
// round a week from the league's start date, each club playing once a week and
// meeting everyone twice, plus midweek rounds of the Danish cup. Tables, club
// pages and the front page all read from here.

export const CUP_NAME = 'Pokalturneringen'
const FULL_TIME_MIN = 110

// Match slots per division as [days after the round's Friday, kickoff]. Spread
// over the week like the real leagues, so most days have football.
const SLOTS: Record<string, [number, string][]> = {
  superliga: [[0, '19:00'], [1, '15:00'], [1, '17:00'], [2, '14:00'], [2, '16:00'], [3, '19:00']],
  '1div': [[6, '18:30'], [0, '18:30'], [1, '13:00'], [1, '15:00'], [2, '13:00'], [2, '15:00']],
  '2div': [[3, '18:30'], [1, '13:00'], [1, '14:00'], [2, '12:00'], [2, '13:00'], [2, '14:00']],
  '3div': [[4, '19:00'], [1, '12:00'], [1, '13:00'], [1, '14:00'], [2, '13:00'], [2, '14:00']],
  bundesliga: [[0, '20:30'], [1, '15:30'], [1, '15:30'], [1, '15:30'], [1, '15:30'], [1, '15:30'], [1, '18:30'], [2, '15:30'], [2, '17:30']],
  bundesliga2: [[0, '18:30'], [0, '18:30'], [1, '13:00'], [1, '13:00'], [1, '13:00'], [1, '20:30'], [2, '13:30'], [2, '13:30'], [2, '13:30']],
  liga3: [[0, '19:00'], [1, '14:00'], [1, '14:00'], [1, '14:00'], [1, '14:00'], [1, '16:30'], [2, '13:30'], [2, '13:30'], [2, '16:30'], [3, '19:00']],
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
  division?: Division
  home: Club
  away: Club
  kickoff: Date
  /** Final score */
  score: [number, number]
  /** Cup ties that end level are settled on penalties */
  penaltyWinner?: 'home' | 'away'
}

// The Danish cup has every club from the Danish divisions
const CUP_DIVISIONS = DIVISIONS.filter((d) => d.countryCode === 'DK')
const strengthRank = new Map<string, number>()
CUP_DIVISIONS.forEach((d, di) => d.clubs.forEach((c, ci) => strengthRank.set(c.id, di * 100 + ci)))

function buildLeague(): Fixture[] {
  const out: Fixture[] = []
  for (const [di, div] of DIVISIONS.entries()) {
    const rounds = 2 * (div.clubs.length - 1)
    for (let round = 0; round < rounds; round++) {
      const friday = addDays(div.seasonStart, round * 7)
      const rand = seeded(hashString(`${div.id}-round-${round}`))
      const slots = shuffle(SLOTS[div.id], rand)
      for (const [pi, [home, away]] of roundRobin(div.clubs, round).entries()) {
        const [dayOffset, time] = slots[pi % slots.length]
        const date = addDays(friday, dayOffset)
        out.push({
          id: `${div.id}-r${round + 1}-${pi}`,
          slug: matchSlug(home.name, away.name, date),
          competition: div.name,
          leagueId: `dk-${div.id}`,
          leagueSlug: div.slug,
          leagueOrder: di,
          round: round + 1,
          division: div,
          home,
          away,
          kickoff: danishTime(date, time),
          score: playMatch(div, home, away, rand),
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
export const isFinished = (f: Fixture, now: number) => f.kickoff.getTime() + FULL_TIME_MIN * 60000 <= now

/** Turns a fixture into a match as it looks at `now` (upcoming, live with a partial score, or finished) */
export function toMatch(f: Fixture, now: number): Match {
  const elapsed = (now - f.kickoff.getTime()) / 60000
  let state: MatchState = 'upcoming'
  let statusLabel: string | undefined
  let progress = 0
  if (elapsed > FULL_TIME_MIN) {
    state = 'finished'
    statusLabel = f.penaltyWinner ? 'Slut e.str.' : 'Slut'
    progress = 1
  } else if (elapsed >= 0) {
    state = 'live'
    if (elapsed >= 45 && elapsed < 60) statusLabel = 'Pause'
    else statusLabel = `${Math.min(elapsed < 45 ? Math.floor(elapsed) + 1 : Math.floor(elapsed) - 14, 90)}'`
    progress = Math.min(1, elapsed / FULL_TIME_MIN)
  }
  const hasScore = state !== 'upcoming'
  const partial = (g: number) => (state === 'finished' ? g : Math.floor(g * progress))
  return {
    id: f.id,
    slug: f.slug,
    sport: 'soccer',
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
  /** Results in the order they were played */
  form: ('V' | 'U' | 'T')[]
}

/** Table for a division from every league match finished by `now` */
export function standings(div: Division, now: number): StandingRow[] {
  const rows = new Map<string, StandingRow>(
    div.clubs.map((club) => [
      club.id,
      { club, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0, form: [] },
    ]),
  )
  const result = (row: StandingRow, f: number, a: number) => {
    row.played++
    row.goalsFor += f
    row.goalsAgainst += a
    if (f > a) {
      row.won++
      row.points += 3
      row.form.push('V')
    } else if (f < a) {
      row.lost++
      row.form.push('T')
    } else {
      row.drawn++
      row.points++
      row.form.push('U')
    }
  }
  for (const f of FIXTURES) {
    if (f.division !== div || !isFinished(f, now)) continue
    result(rows.get(f.home.id)!, f.score[0], f.score[1])
    result(rows.get(f.away.id)!, f.score[1], f.score[0])
  }
  return [...rows.values()].sort(
    (x, y) =>
      y.points - x.points ||
      y.goalsFor - y.goalsAgainst - (x.goalsFor - x.goalsAgainst) ||
      y.goalsFor - x.goalsFor ||
      x.club.name.localeCompare(y.club.name, 'da'),
  )
}
