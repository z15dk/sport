import type { Match } from '../types'
import { clubByName, type Division } from './leagues'
import { hashString, poisson, seeded } from './fixtures'
import { playGame } from './scoring'
import { sportOf } from './leagues'
import { standings, type StandingRow } from './season'

// Fictional background data for the match detail view.

export function findClub(name: string) {
  return clubByName(name)
}

export interface ClubStats {
  position: number
  row: StandingRow
  division: Division
}

export function clubStats(name: string, now: number): ClubStats | undefined {
  const found = findClub(name)
  if (!found) return undefined
  const table = standings(found.division, now)
  const index = table.findIndex((r) => r.club.id === found.club.id)
  return { position: index + 1, row: table[index], division: found.division }
}

export interface PastMatch {
  date: Date
  competition: string
  home: string
  away: string
  homeScore: number
  awayScore: number
}

/** The last `count` fictional meetings between two teams before `before`. */
export function headToHead(teamA: string, teamB: string, before: Date, count = 5): PastMatch[] {
  const rand = seeded(hashString([teamA, teamB].sort().join('|')))
  const a = findClub(teamA)
  const b = findClub(teamB)
  const sameDivision = a && b && a.division.id === b.division.id ? a.division : undefined

  const result: PastMatch[] = []
  let date = new Date(before)
  for (let i = 0; i < count; i++) {
    date = new Date(date.getTime() - (70 + Math.floor(rand() * 150)) * 86_400_000)
    // Ice hockey and basketball have no games from May to August
    const sport = sameDivision ? sportOf(sameDivision) : 'soccer'
    const month = date.getUTCMonth()
    if (sport !== 'soccer' && month >= 4 && month <= 7) date = new Date(Date.UTC(date.getUTCFullYear(), 3, 10 + (month - 4) * 4, 17))
    // Alternate venues, starting with the reverse of the upcoming fixture
    const [home, away] = i % 2 === 0 ? [teamB, teamA] : [teamA, teamB]
    // Football clubs also meet in the cup now and then
    const cup = !sameDivision || (sportOf(sameDivision) === 'soccer' && rand() < 0.2)
    let score: [number, number]
    if (sameDivision && !cup) {
      score = playGame(sportOf(sameDivision), sameDivision, findClub(home)!.club, findClub(away)!.club, rand).score
    } else {
      score = [poisson(1.4, rand), poisson(1.15, rand)]
    }
    result.push({
      date,
      competition: cup ? 'Pokalturneringen' : sameDivision!.name,
      home,
      away,
      homeScore: score[0],
      awayScore: score[1],
    })
  }
  return result
}

export interface MatchStat {
  label: string
  home: number
  away: number
  suffix?: string
}

/** Fictional in-match statistics that grow with the match clock. */
export function matchStats(match: Match): MatchStat[] | undefined {
  if (match.state !== 'live' && match.state !== 'finished') return undefined
  const rand = seeded(hashString(`stats-${match.id}`))
  const progress = match.state === 'finished' ? 1 : liveProgress(match)
  const hg = match.home.score ?? 0
  const ag = match.away.score ?? 0

  const scale = (n: number) => Math.round(n * progress)

  if (match.sport === 'ice_hockey') {
    const shots = (goals: number) => Math.max(goals + 5, scale(22 + rand() * 16))
    const faceoffs = Math.round(40 + rand() * 20)
    return [
      { label: 'Skud på mål', home: shots(hg), away: shots(ag) },
      { label: 'Tekniske opspil vundet', home: faceoffs, away: 100 - faceoffs, suffix: '%' },
      { label: 'Blokerede skud', home: scale(8 + rand() * 12), away: scale(8 + rand() * 12) },
      { label: 'Tacklinger', home: scale(12 + rand() * 18), away: scale(12 + rand() * 18) },
      { label: 'Udvisningsminutter', home: scale(Math.floor(rand() * 6) * 2), away: scale(Math.floor(rand() * 6) * 2) },
    ]
  }
  if (match.sport === 'basketball') {
    const pct = () => Math.round(38 + rand() * 18)
    return [
      { label: 'Skudprocent', home: pct(), away: pct(), suffix: '%' },
      { label: '3-point scoringer', home: scale(6 + rand() * 10), away: scale(6 + rand() * 10) },
      { label: 'Rebounds', home: scale(30 + rand() * 16), away: scale(30 + rand() * 16) },
      { label: 'Assists', home: scale(14 + rand() * 12), away: scale(14 + rand() * 12) },
      { label: 'Turnovers', home: scale(8 + rand() * 10), away: scale(8 + rand() * 10) },
      { label: 'Steals', home: scale(4 + rand() * 8), away: scale(4 + rand() * 8) },
    ]
  }

  const possession = Math.round(42 + rand() * 16 + (hg - ag) * 1.5)
  const onTarget = (goals: number) => Math.max(goals, scale(2 + rand() * 5))
  const homeOn = onTarget(hg)
  const awayOn = onTarget(ag)

  return [
    { label: 'Boldbesiddelse', home: possession, away: 100 - possession, suffix: '%' },
    { label: 'Skud i alt', home: homeOn + scale(3 + rand() * 7), away: awayOn + scale(2 + rand() * 7) },
    { label: 'Skud på mål', home: homeOn, away: awayOn },
    { label: 'Hjørnespark', home: scale(rand() * 9), away: scale(rand() * 8) },
    { label: 'Frispark', home: scale(6 + rand() * 8), away: scale(6 + rand() * 8) },
    { label: 'Gule kort', home: scale(rand() * 4), away: scale(rand() * 4) },
  ]
}

function liveProgress(match: Match) {
  const label = match.statusLabel ?? ''
  if (match.sport === 'ice_hockey') {
    const minute = Number.parseInt(label.split(' ').at(-1) ?? '', 10)
    return Number.isFinite(minute) ? Math.min(1, minute / 60) : 0.5
  }
  if (match.sport === 'basketball') {
    const quarter = Number.parseInt(label, 10)
    return Number.isFinite(quarter) ? quarter / 4 : 0.5
  }
  const minute = Number.parseInt(label, 10)
  if (Number.isFinite(minute)) return Math.min(1, minute / 90)
  return label === 'Pause' ? 0.5 : 0.3
}

/** Words for scores in each sport, for tables and comparisons */
export function scoreWords(sport: Match['sport']) {
  return sport === 'basketball'
    ? { unit: 'Point', scored: 'Point scoret', conceded: 'Point imod', perGame: 'Point pr. kamp', short: 'Score' }
    : { unit: 'Mål', scored: 'Mål scoret', conceded: 'Mål imod', perGame: 'Mål pr. kamp', short: 'Mål' }
}
