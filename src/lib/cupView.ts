import type { ExternalGame } from '../data/external'
import { danishRound } from '../data/external'
import type { StatGame } from '../data/stats'
import type { Match } from '../types'
import type { TableRow } from '../data/matchExtra'

// A cup's season from its games (src/components/cup/CupPage.tsx): the rounds in the order they are played,
// where the cup has got to, who scores the goals, the biggest wins. From the games we have, nothing guessed.

export interface CupRound {
  /** The source's name ("3rd Round Qualifying") */
  raw: string
  /** Ours ("Kvalifikation, 3. runde") */
  name: string
  first: number
  last: number
  played: number
  total: number
  matches: Match[]
}

export type CupStatus =
  | { kind: 'live'; count: number }
  | { kind: 'next'; home: string; away: string; kickoff: string; slug: string; round: string }
  | { kind: 'waiting'; after: string }

export interface CupScorer {
  name: string
  team: string
  logo?: string
  goals: number
}

export interface CupGameFact {
  home: string
  away: string
  score: [number, number]
  round?: string
  slug?: string
  date: number
}

export interface CupView {
  rounds: CupRound[]
  /** The round being played now or next */
  current?: CupRound
  /** Teams in the current round */
  teamsInRound: number
  status: CupStatus
  scorers: CupScorer[]
  biggestWin?: CupGameFact
  mostGoals?: CupGameFact
  /** Finished games and their goals over the season */
  played: number
  goals: number
}

const GROUP = /^group\b/i
const REPLAY = /\s*replays?$/i

export function cupView({ games, toMatch, statGames, now }: { games: ExternalGame[]; toMatch: (g: ExternalGame) => Match; statGames: StatGame[]; now: number }): CupView {
  // A round's replays (the FA Cup's qualifying rounds) belong to the round itself, not a round of their own
  const byRound = new Map<string, ExternalGame[]>()
  for (const g of games) {
    if (!g.round || g.state === 'postponed') continue
    const round = g.round.replace(REPLAY, '')
    ;(byRound.get(round) ?? byRound.set(round, []).get(round)!).push(g)
  }
  // The group stage's groups (EFL Trophy: "Group North - 1" … "Group South - 8") as one stage
  const rounds: CupRound[] = []
  const groupGames = [...byRound.entries()].filter(([r]) => GROUP.test(r)).flatMap(([, list]) => list)
  const entries: [string, ExternalGame[]][] = [...byRound.entries()].filter(([r]) => !GROUP.test(r))
  if (groupGames.length) entries.push(['Group Stage', groupGames])
  for (const [raw, list] of entries) {
    const times = list.map((g) => Date.parse(g.kickoff))
    const sorted = [...list].sort((a, b) => a.kickoff.localeCompare(b.kickoff))
    rounds.push({
      raw,
      name: raw === 'Group Stage' ? 'Gruppespil' : (danishRound(raw) ?? raw),
      first: Math.min(...times),
      last: Math.max(...times),
      played: list.filter((g) => g.state === 'finished').length,
      total: list.length,
      matches: sorted.map(toMatch),
    })
  }
  rounds.sort((a, b) => a.first - b.first)

  const open = rounds.filter((r) => r.played < r.total)
  const current = open[0] ?? rounds.at(-1)
  const teamsInRound = current ? new Set(current.matches.flatMap((m) => [m.home.name, m.away.name])).size : 0

  const live = games.filter((g) => g.state === 'live').length
  const next = games.filter((g) => g.state === 'upcoming' && Date.parse(g.kickoff) > now).sort((a, b) => a.kickoff.localeCompare(b.kickoff))[0]
  const status: CupStatus = live
    ? { kind: 'live', count: live }
    : next
      ? (() => {
          const m = toMatch(next)
          return { kind: 'next', home: m.home.name, away: m.away.name, kickoff: next.kickoff, slug: m.slug, round: GROUP.test(next.round ?? '') ? 'Gruppespil' : `${danishRound((next.round ?? '').replace(REPLAY, '')) ?? ''}${REPLAY.test(next.round ?? '') ? ' (omkamp)' : ''}` }
        })()
      : { kind: 'waiting', after: current?.name ?? '' }

  // The goals by player, from the games' goals (own goals not counted)
  const tally = new Map<string, CupScorer>()
  let goals = 0
  let biggestWin: CupGameFact | undefined
  let mostGoals: CupGameFact | undefined
  for (const g of statGames) {
    const [h, a] = g.score
    goals += h + a
    const fact: CupGameFact = { home: g.home.name, away: g.away.name, score: g.score, slug: g.slug, date: g.kickoff?.getTime() ?? 0 }
    if (!biggestWin || Math.abs(h - a) > Math.abs(biggestWin.score[0] - biggestWin.score[1]) || (Math.abs(h - a) === Math.abs(biggestWin.score[0] - biggestWin.score[1]) && h + a > biggestWin.score[0] + biggestWin.score[1])) biggestWin = fact
    if (!mostGoals || h + a > mostGoals.score[0] + mostGoals.score[1]) mostGoals = fact
    for (const i of g.incidents ?? []) {
      if ((i.kind !== 'goal' && i.kind !== 'penalty') || !i.player) continue
      const side = i.side === 'home' ? g.home : g.away
      const team = side.name
      const key = `${i.player}|${team}`
      const s = tally.get(key) ?? tally.set(key, { name: i.player, team, logo: side.logo, goals: 0 }).get(key)!
      s.goals++
    }
  }
  const scorers = [...tally.values()].sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name, 'da')).slice(0, 10)
  return { rounds, current, teamsInRound, status, scorers, biggestWin: biggestWin && biggestWin.score[0] !== biggestWin.score[1] ? biggestWin : undefined, mostGoals, played: statGames.length, goals }
}

/**
 * The group tables from the group games (the EFL Trophy, where the source has no table): 3 points for a win, 1 each
 * for a draw and 1 more for winning the penalty shoot-out after it. Ordered by points, goal difference, goals scored.
 * `unsure` when a drawn game has no shoot-out score yet (its extra point is missing).
 */
export function cupGroups(games: ExternalGame[], logoFor: (name: string, logo?: string) => string | undefined): { groups: TableRow[][]; unsure: boolean } {
  const groups = new Map<string, Map<string, TableRow>>()
  let unsure = false
  for (const g of games) {
    if (!g.round || !GROUP.test(g.round) || g.state === 'postponed') continue
    const name = danishRound(g.round) ?? g.round
    const table = groups.get(name) ?? groups.set(name, new Map()).get(name)!
    const row = (team: ExternalGame['home']) =>
      table.get(team.name) ?? table.set(team.name, { rank: 0, name: team.name, logo: logoFor(team.name, team.logo), played: 0, won: 0, drawn: 0, lost: 0, for: 0, against: 0, points: 0, group: name }).get(team.name)!
    const home = row(g.home)
    const away = row(g.away)
    if (g.state !== 'finished' || g.homeScore === undefined || g.awayScore === undefined) continue
    for (const [r, f, a] of [
      [home, g.homeScore, g.awayScore],
      [away, g.awayScore, g.homeScore],
    ] as const) {
      r.played++
      r.for! += f
      r.against! += a
      if (f > a) (r.won++, (r.points! += 3))
      else if (f < a) r.lost++
      else (r.drawn!++, (r.points! += 1))
    }
    if (g.homeScore === g.awayScore) {
      if (g.pens) (g.pens[0] > g.pens[1] ? home : away).points! += 1
      else unsure = true
    }
  }
  const out = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'da', { numeric: true }))
    .map(([, t]) =>
      [...t.values()]
        .sort((a, b) => b.points! - a.points! || b.for! - b.against! - (a.for! - a.against!) || b.for! - a.for! || a.name.localeCompare(b.name, 'da'))
        .map((r, i) => ({ ...r, rank: i + 1 })),
    )
  return { groups: out, unsure }
}
