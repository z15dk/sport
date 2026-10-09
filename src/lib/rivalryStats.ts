// The numbers of a head-to-head page (/opgoer/<a>-mod-<b>, src/lib/rivalry.ts) worked out from the meetings:
// goals, how often both score, clean sheets, the last five, the current run, the competitions they met in and
// the most common result. Pure (tests/data/rivalryStats.test.ts).

export interface Meeting {
  date: Date
  competition: string
  home: string
  away: string
  homeScore: number
  awayScore: number
}

export type Outcome = 'V' | 'U' | 'T'

export interface RivalryStats {
  n: number
  goalsA: number
  goalsB: number
  /** Matches with more than 2.5 goals, both teams scoring, a's and b's clean sheets, goalless draws */
  over25: number
  btts: number
  cleanA: number
  cleanB: number
  nilNil: number
  /** Club a's results in the last five meetings, oldest first */
  lastFive: Outcome[]
  /** The run going on now, as a sentence, when it says something (3 or more) */
  run?: string
  competitions: { name: string; n: number; a: number; draw: number; b: number }[]
  /** The most common final score (higher first), when it happened more than once */
  commonScore?: { score: string; times: number }
  first?: Meeting
}

const outcome = (ga: number, gb: number): Outcome => (ga > gb ? 'V' : ga < gb ? 'T' : 'U')

/** `meetings` newest first; `a` is club a's name as the meetings write it */
export function rivalryStats(meetings: Meeting[], a: string, names: { a: string; b: string }): RivalryStats {
  const s: RivalryStats = { n: meetings.length, goalsA: 0, goalsB: 0, over25: 0, btts: 0, cleanA: 0, cleanB: 0, nilNil: 0, lastFive: [], competitions: [] }
  const comps = new Map<string, { name: string; n: number; a: number; draw: number; b: number }>()
  const scores = new Map<string, number>()
  const results: Outcome[] = [] // newest first, from a's side
  for (const m of meetings) {
    const aHome = m.home === a
    const ga = aHome ? m.homeScore : m.awayScore
    const gb = aHome ? m.awayScore : m.homeScore
    s.goalsA += ga
    s.goalsB += gb
    if (ga + gb > 2.5) s.over25++
    if (ga > 0 && gb > 0) s.btts++
    if (gb === 0) s.cleanA++
    if (ga === 0) s.cleanB++
    if (ga + gb === 0) s.nilNil++
    const r = outcome(ga, gb)
    results.push(r)
    const c = comps.get(m.competition) ?? comps.set(m.competition, { name: m.competition, n: 0, a: 0, draw: 0, b: 0 }).get(m.competition)!
    c.n++
    if (r === 'V') c.a++
    else if (r === 'T') c.b++
    else c.draw++
    const key = `${Math.max(m.homeScore, m.awayScore)}-${Math.min(m.homeScore, m.awayScore)}`
    scores.set(key, (scores.get(key) ?? 0) + 1)
  }
  s.lastFive = results.slice(0, 5).reverse()
  s.competitions = [...comps.values()].sort((x, y) => y.n - x.n)
  const common = [...scores.entries()].sort((x, y) => y[1] - x[1])[0]
  if (common && common[1] > 1) s.commonScore = { score: common[0], times: common[1] }
  s.first = meetings.at(-1)
  s.run = currentRun(results, names)
  return s
}

/** "Real Madrid har vundet de seneste 4 opgør", "Villarreal er ubesejret i 6", "De seneste 3 er endt uafgjort" */
function currentRun(results: Outcome[], names: { a: string; b: string }): string | undefined {
  const count = (ok: (r: Outcome) => boolean) => {
    let k = 0
    while (k < results.length && ok(results[k])) k++
    return k
  }
  const winsA = count((r) => r === 'V')
  const winsB = count((r) => r === 'T')
  const draws = count((r) => r === 'U')
  const unbeatenA = count((r) => r !== 'T')
  const unbeatenB = count((r) => r !== 'V')
  if (winsA >= 2) return `${names.a} har vundet de seneste ${winsA} opgør`
  if (winsB >= 2) return `${names.b} har vundet de seneste ${winsB} opgør`
  if (draws >= 3) return `De seneste ${draws} opgør er endt uafgjort`
  if (unbeatenA >= 3 && unbeatenA > unbeatenB) return `${names.a} er ubesejret i de seneste ${unbeatenA} opgør`
  if (unbeatenB >= 3 && unbeatenB > unbeatenA) return `${names.b} er ubesejret i de seneste ${unbeatenB} opgør`
  return undefined
}
