import { normalize } from '../data/aliases'
import { danishRound } from '../data/external'

// A knock-out tournament as a bracket: one column per round, two-legged ties
// as one pairing with the aggregate score, ordered so each tie sits by the
// one its winner went on to (as Sofascore shows it).

export interface BracketGame {
  id: string
  round?: string
  date: number
  home: { name: string; logo?: string }
  away: { name: string; logo?: string }
  homeScore?: number
  awayScore?: number
  finished: boolean
  slug?: string
}

export interface BracketTeam {
  name: string
  logo?: string
  /** Goals over the tie's legs (played ones) */
  goals?: number
}

export interface BracketTie {
  key: string
  /** Its place in the column, in tie heights from the top: midway between the ties its teams came from */
  pos: number
  /** The places of the ties its teams came from in the round before (for the lines between them) */
  from: number[]
  teams: [BracketTeam, BracketTeam]
  /** 0 or 1 when the tie is decided on goals over its legs */
  winner?: 0 | 1
  /** The legs, first first (for the links) */
  legs: { slug?: string; date: number; finished: boolean }[]
}

export interface BracketRound {
  name: string
  ties: BracketTie[]
}

/** Rounds that belong to a knock-out: qualifying rounds, play-offs, "round of 16", quarter- and semi-finals, the final */
const KNOCKOUT = /qualif|preliminary|play-?off|knock|round of|1\/\d+|final|\d+(st|nd|rd|th) round/i
/** A league or group stage: then it is not a bracket */
const LEAGUE_STAGE = /regular season|group|league stage|league phase|matchday/i

/** Whether a tournament's rounds make a bracket (every round a knock-out round) */
export function isKnockout(rounds: (string | undefined)[]): boolean {
  const named = rounds.filter((r): r is string => !!r)
  if (named.length < 2) return false
  return !named.some((r) => LEAGUE_STAGE.test(r)) && named.every((r) => KNOCKOUT.test(r))
}

const key = (name: string) => normalize(name) || name.toLowerCase()
/** A women's team without the " W" every team in a women's tournament has */
const shown = (name: string) => name.replace(/\s+(w|women)$/i, '').trim() || name

export function buildBracket(games: BracketGame[]): BracketRound[] {
  // By round, rounds in the order they were played
  const byRound = new Map<string, BracketGame[]>()
  for (const g of games) {
    if (!g.round) continue
    const list = byRound.get(g.round) ?? byRound.set(g.round, []).get(g.round)!
    list.push(g)
  }
  const ordered = [...byRound.entries()].sort(([, a], [, b]) => Math.min(...a.map((g) => g.date)) - Math.min(...b.map((g) => g.date)))
  const rounds: BracketRound[] = ordered.map(([round, list]) => {
    const ties = new Map<string, BracketTie>()
    for (const g of [...list].sort((a, b) => a.date - b.date)) {
      const pair = [key(g.home.name), key(g.away.name)].sort().join('|')
      let tie = ties.get(pair)
      if (!tie) {
        tie = { key: pair, pos: 0, from: [], teams: [{ name: shown(g.home.name), logo: g.home.logo }, { name: shown(g.away.name), logo: g.away.logo }], legs: [] }
        ties.set(pair, tie)
      }
      tie.legs.push({ slug: g.slug, date: g.date, finished: g.finished })
      if (g.homeScore === undefined || g.awayScore === undefined || !g.finished) continue
      for (const [side, goals] of [
        [g.home, g.homeScore],
        [g.away, g.awayScore],
      ] as const) {
        const t = tie.teams.find((x) => key(x.name) === key(shown(side.name)))!
        t.goals = (t.goals ?? 0) + goals
        t.logo ??= side.logo
      }
    }
    for (const tie of ties.values()) {
      const [a, b] = tie.teams
      if (tie.legs.every((l) => l.finished) && a.goals !== undefined && b.goals !== undefined && a.goals !== b.goals) tie.winner = a.goals > b.goals ? 0 : 1
    }
    return { name: danishRound(round) ?? round, ties: [...ties.values()] }
  })
  // Each round's ties in the order of the ties their winners went on to, from the last round back
  for (let i = rounds.length - 2; i >= 0; i--) {
    const next = rounds[i + 1].ties
    const place = (tie: BracketTie) => {
      const names = tie.teams.map((t) => key(t.name))
      const at = next.findIndex((n) => n.teams.some((t) => names.includes(key(t.name))))
      return at < 0 ? Infinity : at
    }
    rounds[i].ties = rounds[i].ties.map((t, j) => ({ t, j, p: place(t) })).sort((x, y) => x.p - y.p || x.j - y.j).map((x) => x.t)
  }
  // Places: the first round one under the other; later ties midway between the ties their teams came from,
  // teams entering later in the free places
  rounds[0]?.ties.forEach((t, i) => (t.pos = i))
  for (let i = 1; i < rounds.length; i++) {
    const prev = rounds[i - 1].ties
    const wanted = rounds[i].ties.map((tie) => {
      const names = tie.teams.map((t) => key(t.name))
      const from = prev.filter((p) => p.teams.some((t) => names.includes(key(t.name))))
      tie.from = from.map((p) => p.pos)
      return { tie, at: from.length ? from.reduce((n, p) => n + p.pos, 0) / from.length : undefined }
    })
    const taken: number[] = []
    const free = (x: number) => taken.every((y) => Math.abs(y - x) >= 1)
    for (const w of wanted.filter((w) => w.at !== undefined).sort((a, b) => a.at! - b.at!)) {
      let p = w.at!
      while (!free(p)) p = Math.max(...taken.filter((y) => Math.abs(y - p) < 1)) + 1
      w.tie.pos = p
      taken.push(p)
    }
    for (const w of wanted.filter((w) => w.at === undefined)) {
      let p = 0
      while (!free(p)) p += 0.5
      w.tie.pos = p
      taken.push(p)
    }
    rounds[i].ties.sort((a, b) => a.pos - b.pos)
  }
  return rounds
}
