import type { Match } from '../types'
import { clubByName, type Division } from './danishClubs'
import { hashString, playMatch, poisson, seeded, standings, type StandingRow } from './fixtures'

// Fictional background data for the match detail view.

export const ROUNDS_PLAYED = 10

export function findClub(name: string) {
  return clubByName(name)
}

export interface ClubStats {
  position: number
  row: StandingRow
  division: Division
}

export function clubStats(name: string): ClubStats | undefined {
  const found = findClub(name)
  if (!found) return undefined
  const table = standings(found.division, ROUNDS_PLAYED)
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
    // Alternate venues, starting with the reverse of the upcoming fixture
    const [home, away] = i % 2 === 0 ? [teamB, teamA] : [teamA, teamB]
    const cup = !sameDivision || rand() < 0.2
    let score: [number, number]
    if (sameDivision && !cup) {
      score = playMatch(sameDivision, findClub(home)!.club, findClub(away)!.club, rand)
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

  const possession = Math.round(42 + rand() * 16 + (hg - ag) * 1.5)
  const scale = (n: number) => Math.round(n * progress)
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
  const minute = Number.parseInt(match.statusLabel ?? '', 10)
  if (Number.isFinite(minute)) return Math.min(1, minute / 90)
  return match.statusLabel === 'Pause' ? 0.5 : 0.3
}
