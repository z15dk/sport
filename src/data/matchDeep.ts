import type { Lineup } from './matchExtra'
import type { TeamStats } from './teamStats'

// The match page's deeper numbers before kick-off (and beside the match afterwards): the clubs' season
// statistics, their players' season, the line-up each started its latest game with, and Matchly's own
// calculation of the result from the season's goals. Made on the server (src/lib/matchDeep.ts) and handed
// to the page, so the browser shows exactly the same.

/** A player's season in the league (from the statistics bank) */
export interface SeasonPlayer {
  id: number
  name: string
  photo?: string
  position?: string
  apps: number
  minutes: number
  goals: number
  assists: number
  rating?: number
  keyPasses: number
  shots: number
  shotsOn: number
  saves: number
  yellow: number
  red: number
}

/** The line-up a club started its latest game with: the best guess until the line-ups are out */
export interface LastXI {
  lineup: Lineup
  /** The opponent and day of that game */
  against: string
  date: string
  home: boolean
}

/** Matchly's calculation of the result: Poisson goals from the season's goals at home and away */
export interface WinChance {
  home: number
  draw: number
  away: number
  /** Expected goals for each side */
  goalsHome: number
  goalsAway: number
  /** The likeliest scores */
  scores: { home: number; away: number; pct: number }[]
  /** The games it is counted from */
  games: number
}

export interface MatchDeep {
  teamStats?: { home?: TeamStats; away?: TeamStats }
  players?: { home: SeasonPlayer[]; away: SeasonPlayer[] }
  lastXI?: { home?: LastXI; away?: LastXI }
  chance?: WinChance
}

/** A finished game for the calculation */
export interface ScoredGame {
  home: string
  away: string
  homeGoals: number
  awayGoals: number
}

/** How strongly a club's few games are pulled towards the league's average (as in the season simulation) */
const SHRINK = 4

const poisson = (k: number, l: number) => {
  let p = Math.exp(-l)
  for (let i = 1; i <= k; i++) p = (p * l) / i
  return p
}

/**
 * The chance of a home win, a draw and an away win: each side's goals as a Poisson number from its attack
 * (at home / away) against the other's defence (away / at home), relative to the league's average home and
 * away goals and pulled towards it while the season is young. A calculation, not a forecast or odds.
 */
export function winChance(games: ScoredGame[], home: string, away: string): WinChance | undefined {
  if (games.length < 12) return undefined
  const avgHome = games.reduce((t, g) => t + g.homeGoals, 0) / games.length
  const avgAway = games.reduce((t, g) => t + g.awayGoals, 0) / games.length
  if (!avgHome || !avgAway) return undefined
  const atHome = games.filter((g) => g.home === home)
  const awayGames = games.filter((g) => g.away === away)
  if (atHome.length < 2 || awayGames.length < 2) return undefined
  const rate = (goals: number, played: number, avg: number) => (goals + SHRINK * avg) / (played + SHRINK) / avg
  const homeAttack = rate(atHome.reduce((t, g) => t + g.homeGoals, 0), atHome.length, avgHome)
  const homeDefence = rate(atHome.reduce((t, g) => t + g.awayGoals, 0), atHome.length, avgAway)
  const awayAttack = rate(awayGames.reduce((t, g) => t + g.awayGoals, 0), awayGames.length, avgAway)
  const awayDefence = rate(awayGames.reduce((t, g) => t + g.homeGoals, 0), awayGames.length, avgHome)
  const lh = avgHome * homeAttack * awayDefence
  const la = avgAway * awayAttack * homeDefence
  let h = 0
  let d = 0
  let a = 0
  const scores: WinChance['scores'] = []
  for (let i = 0; i <= 9; i++) {
    for (let j = 0; j <= 9; j++) {
      const p = poisson(i, lh) * poisson(j, la)
      if (i > j) h += p
      else if (i === j) d += p
      else a += p
      scores.push({ home: i, away: j, pct: p })
    }
  }
  const total = h + d + a
  // Whole per cents that add up to 100
  const raw = [h / total, d / total, a / total].map((x) => x * 100)
  const whole = raw.map(Math.floor)
  const order = raw.map((x, i) => ({ i, rest: x - Math.floor(x) })).sort((x, y) => y.rest - x.rest)
  for (let k = 0; k < 100 - whole.reduce((t, x) => t + x, 0); k++) whole[order[k].i]++
  return {
    home: whole[0],
    draw: whole[1],
    away: whole[2],
    goalsHome: Math.round(lh * 100) / 100,
    goalsAway: Math.round(la * 100) / 100,
    scores: scores
      .sort((x, y) => y.pct - x.pct)
      .slice(0, 3)
      .map((s) => ({ ...s, pct: Math.round((s.pct / total) * 100) })),
    games: games.length,
  }
}
