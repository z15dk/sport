import type { Incident } from '../types'
import type { Club, Division } from './leagues'
import { allFixtures, isFinished, type Fixture } from './season'

// Our own statistics, computed from the real matches (TheSportsDB and our
// match database): results, half-time scores, attendance, goals and cards.

/** Goal minutes are counted in six quarter-hours: 1-15, 16-30, 31-45+, 46-60, 61-75, 76-90+ */
export const INTERVALS = ["1-15'", "16-30'", "31-45'", "46-60'", "61-75'", "76-90'"]
const interval = (minute: number) => Math.max(0, Math.min(5, Math.floor((Math.max(1, minute) - 1) / 15)))

const isGoal = (i: Incident) => i.kind === 'goal' || i.kind === 'penalty' || i.kind === 'own-goal'
/** The side a goal counts for (an own goal counts for the other side) */
const scoringSide = (i: Incident): Incident['side'] => (i.kind === 'own-goal' ? (i.side === 'home' ? 'away' : 'home') : i.side)

const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0)

function finishedIn(division: Division): Fixture[] {
  return allFixtures().filter((f) => f.division === division && isFinished(f))
}

export interface ScorerRow {
  player: string
  club: Club
  goals: number
  penalties: number
}

export interface CardRow {
  club: Club
  yellow: number
  red: number
}

export interface LeagueStats {
  played: number
  goals: number
  goalsPerMatch: number
  homeWinPct: number
  drawPct: number
  awayWinPct: number
  over25Pct: number
  bttsPct: number
  /** Share of goals scored in the first half, from matches with a half-time score */
  firstHalfPct?: number
  /** Goals per quarter-hour, from matches with goal minutes */
  byInterval?: { goals: number[]; matches: number }
  scorers: ScorerRow[]
  cards: CardRow[]
  /** Average home attendance per club, highest first */
  attendance: { club: Club; average: number; matches: number }[]
  biggestWin?: Fixture
  mostGoals?: Fixture
}

const cache = new Map<string, { fixtures: Fixture[]; stats: unknown }>()
/** Computes once per season version (the fixture list changes when new data arrives) */
function memo<T>(key: string, compute: () => T): T {
  const fixtures = allFixtures()
  const hit = cache.get(key)
  if (hit && hit.fixtures === fixtures) return hit.stats as T
  const stats = compute()
  cache.set(key, { fixtures, stats })
  return stats
}

function scorersOf(fixtures: Fixture[], only?: Club): ScorerRow[] {
  const rows = new Map<string, ScorerRow>()
  for (const f of fixtures) {
    for (const i of f.incidents ?? []) {
      if (!i.player || (i.kind !== 'goal' && i.kind !== 'penalty')) continue
      const club = i.side === 'home' ? f.home : f.away
      if (only && club.id !== only.id) continue
      const key = `${club.id}|${i.player}`
      const row = rows.get(key) ?? rows.set(key, { player: i.player, club, goals: 0, penalties: 0 }).get(key)!
      row.goals++
      if (i.kind === 'penalty') row.penalties++
    }
  }
  return [...rows.values()].sort((a, b) => b.goals - a.goals || a.penalties - b.penalties || a.player.localeCompare(b.player, 'da'))
}

export function leagueStats(division: Division): LeagueStats | undefined {
  return memo(`league|${division.id}`, () => {
    const fixtures = finishedIn(division)
    if (!fixtures.length) return undefined
    let goals = 0
    let home = 0
    let draw = 0
    let over = 0
    let btts = 0
    let htGoals = 0
    let htAll = 0
    const intervals = [0, 0, 0, 0, 0, 0]
    let withMinutes = 0
    const cards = new Map<string, CardRow>()
    const crowd = new Map<string, { club: Club; total: number; matches: number }>()
    let biggestWin: Fixture | undefined
    let mostGoals: Fixture | undefined
    for (const f of fixtures) {
      const [h, a] = f.score
      goals += h + a
      if (h > a) home++
      else if (h === a) draw++
      if (h + a > 2) over++
      if (h > 0 && a > 0) btts++
      if (f.ht) {
        htGoals += f.ht[0] + f.ht[1]
        htAll += h + a
      }
      const goalsWithMinute = (f.incidents ?? []).filter(isGoal)
      if (goalsWithMinute.length && goalsWithMinute.length === h + a) {
        withMinutes++
        for (const g of goalsWithMinute) intervals[interval(g.minute)]++
      }
      for (const i of f.incidents ?? []) {
        if (i.kind !== 'yellow' && i.kind !== 'red') continue
        const club = i.side === 'home' ? f.home : f.away
        const row = cards.get(club.id) ?? cards.set(club.id, { club, yellow: 0, red: 0 }).get(club.id)!
        row[i.kind]++
      }
      if (f.spectators) {
        const c = crowd.get(f.home.id) ?? crowd.set(f.home.id, { club: f.home, total: 0, matches: 0 }).get(f.home.id)!
        c.total += f.spectators
        c.matches++
      }
      if (!biggestWin || Math.abs(h - a) > Math.abs(biggestWin.score[0] - biggestWin.score[1])) biggestWin = f
      if (!mostGoals || h + a > mostGoals.score[0] + mostGoals.score[1]) mostGoals = f
    }
    const n = fixtures.length
    return {
      played: n,
      goals,
      goalsPerMatch: goals / n,
      homeWinPct: pct(home, n),
      drawPct: pct(draw, n),
      awayWinPct: pct(n - home - draw, n),
      over25Pct: pct(over, n),
      bttsPct: pct(btts, n),
      firstHalfPct: htAll ? pct(htGoals, htAll) : undefined,
      byInterval: withMinutes ? { goals: intervals, matches: withMinutes } : undefined,
      scorers: scorersOf(fixtures).slice(0, 10),
      cards: [...cards.values()].sort((x, y) => y.red * 3 + y.yellow - (x.red * 3 + x.yellow)),
      attendance: [...crowd.values()]
        .map((c) => ({ club: c.club, average: Math.round(c.total / c.matches), matches: c.matches }))
        .sort((x, y) => y.average - x.average),
      biggestWin: biggestWin && biggestWin.score[0] !== biggestWin.score[1] ? biggestWin : undefined,
      mostGoals,
    }
  })
}

export interface Record3 {
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  points: number
}

export interface ClubSeasonStats {
  home: Record3
  away: Record3
  played: number
  cleanSheets: number
  failedToScore: number
  bttsPct: number
  over25Pct: number
  goalsForPerMatch: number
  goalsAgainstPerMatch: number
  /** Scored and conceded per quarter-hour, from matches with goal minutes */
  byInterval?: { scored: number[]; conceded: number[]; matches: number }
  /** Results after leading / trailing at half-time */
  halfTime?: { leading: number; leadingWon: number; trailing: number; trailingPoints: number }
  /** Current run, e.g. { kind: 'V', length: 3 } */
  streak?: { kind: 'V' | 'U' | 'T'; length: number }
  longestUnbeaten: number
  scorers: ScorerRow[]
  yellow: number
  red: number
  homeAttendance?: number
  /** Matches with goals and cards registered (cards per match are counted over these) */
  withIncidents: number
  /** Penalty goals for and against, own goals by the opponents (from matches with incidents) */
  penaltiesScored: number
  penaltiesConceded: number
  ownGoalsFor: number
  /** Goals in the first and second half (matches where every goal has a minute) */
  halves?: { scoredFirst: number; scoredSecond: number; concededFirst: number; concededSecond: number }
  /** Biggest win and heaviest defeat: [for, against, opponent, date] */
  biggestWin?: { gf: number; ga: number; opponent: string; date: Date }
  worstDefeat?: { gf: number; ga: number; opponent: string; date: Date }
}

const emptyRecord = (): Record3 => ({ played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 })

/** A club's season in its league, computed from its finished matches */
export function clubSeasonStats(club: Club, division: Division): ClubSeasonStats | undefined {
  return memo(`club|${club.id}|${division.id}`, () => {
    const fixtures = finishedIn(division).filter((f) => f.home.id === club.id || f.away.id === club.id)
    if (!fixtures.length) return undefined
    const home = emptyRecord()
    const away = emptyRecord()
    let cleanSheets = 0
    let failedToScore = 0
    let btts = 0
    let over = 0
    const scored = [0, 0, 0, 0, 0, 0]
    const conceded = [0, 0, 0, 0, 0, 0]
    let withMinutes = 0
    const halfTime = { leading: 0, leadingWon: 0, trailing: 0, trailingPoints: 0 }
    let hasHt = false
    const results: ('V' | 'U' | 'T')[] = []
    let yellow = 0
    let red = 0
    let crowd = 0
    let crowdMatches = 0
    let withIncidents = 0
    let penaltiesScored = 0
    let penaltiesConceded = 0
    let ownGoalsFor = 0
    const halves = { scoredFirst: 0, scoredSecond: 0, concededFirst: 0, concededSecond: 0 }
    let biggestWin: ClubSeasonStats['biggestWin']
    let worstDefeat: ClubSeasonStats['worstDefeat']
    for (const f of fixtures) {
      const isHome = f.home.id === club.id
      const side = isHome ? 'home' : 'away'
      const [gf, ga] = isHome ? f.score : [f.score[1], f.score[0]]
      const rec = isHome ? home : away
      rec.played++
      rec.goalsFor += gf
      rec.goalsAgainst += ga
      const result = gf > ga ? 'V' : gf === ga ? 'U' : 'T'
      if (result === 'V') rec.won++
      else if (result === 'U') rec.drawn++
      else rec.lost++
      rec.points += result === 'V' ? 3 : result === 'U' ? 1 : 0
      results.push(result)
      if (ga === 0) cleanSheets++
      if (gf === 0) failedToScore++
      if (gf > 0 && ga > 0) btts++
      if (gf + ga > 2) over++
      if (f.ht) {
        hasHt = true
        const [hf, ha] = isHome ? f.ht : [f.ht[1], f.ht[0]]
        if (hf > ha) {
          halfTime.leading++
          if (result === 'V') halfTime.leadingWon++
        } else if (hf < ha) {
          halfTime.trailing++
          halfTime.trailingPoints += result === 'V' ? 3 : result === 'U' ? 1 : 0
        }
      }
      const goals = (f.incidents ?? []).filter(isGoal)
      if (goals.length && goals.length === gf + ga) {
        withMinutes++
        for (const g of goals) {
          const ours = scoringSide(g) === side
          ;(ours ? scored : conceded)[interval(g.minute)]++
          const second = g.minute > 45
          if (ours) halves[second ? 'scoredSecond' : 'scoredFirst']++
          else halves[second ? 'concededSecond' : 'concededFirst']++
        }
      }
      if (f.incidents?.length) {
        withIncidents++
        for (const g of goals) {
          if (g.kind === 'penalty') {
            if (g.side === side) penaltiesScored++
            else penaltiesConceded++
          }
          if (g.kind === 'own-goal' && g.side !== side) ownGoalsFor++
        }
      }
      const opponent = isHome ? f.away.name : f.home.name
      if (gf > ga && (!biggestWin || gf - ga > biggestWin.gf - biggestWin.ga || (gf - ga === biggestWin.gf - biggestWin.ga && gf > biggestWin.gf)))
        biggestWin = { gf, ga, opponent, date: f.kickoff }
      if (gf < ga && (!worstDefeat || ga - gf > worstDefeat.ga - worstDefeat.gf || (ga - gf === worstDefeat.ga - worstDefeat.gf && ga > worstDefeat.ga)))
        worstDefeat = { gf, ga, opponent, date: f.kickoff }
      for (const i of f.incidents ?? []) {
        if (i.side !== side) continue
        if (i.kind === 'yellow') yellow++
        if (i.kind === 'red') red++
      }
      if (isHome && f.spectators) {
        crowd += f.spectators
        crowdMatches++
      }
    }
    const last = results.at(-1)!
    let length = 0
    for (let i = results.length - 1; i >= 0 && results[i] === last; i--) length++
    let longestUnbeaten = 0
    let run = 0
    for (const r of results) {
      run = r === 'T' ? 0 : run + 1
      longestUnbeaten = Math.max(longestUnbeaten, run)
    }
    const n = fixtures.length
    return {
      home,
      away,
      played: n,
      cleanSheets,
      failedToScore,
      bttsPct: pct(btts, n),
      over25Pct: pct(over, n),
      goalsForPerMatch: (home.goalsFor + away.goalsFor) / n,
      goalsAgainstPerMatch: (home.goalsAgainst + away.goalsAgainst) / n,
      byInterval: withMinutes ? { scored, conceded, matches: withMinutes } : undefined,
      halfTime: hasHt ? halfTime : undefined,
      streak: { kind: last, length },
      longestUnbeaten,
      scorers: scorersOf(fixtures, club).slice(0, 5),
      yellow,
      red,
      homeAttendance: crowdMatches ? Math.round(crowd / crowdMatches) : undefined,
      withIncidents,
      penaltiesScored,
      penaltiesConceded,
      ownGoalsFor,
      halves: withMinutes ? halves : undefined,
      biggestWin,
      worstDefeat,
    }
  })
}
