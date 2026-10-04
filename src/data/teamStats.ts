// A team's season statistics and its injured and suspended players, from our
// football data source (src/lib/apisports.ts: apiTeamStats, apiInjuries).

/** Goals or cards per 15 minutes: "0-15", "16-30", ..., "76-90", "91-105", "106-120" */
export type Periods = { period: string; value: number }[]

export interface TeamStats {
  played: { home: number; away: number; total: number }
  wins: { home: number; away: number; total: number }
  draws: { home: number; away: number; total: number }
  loses: { home: number; away: number; total: number }
  goalsFor: { home: number; away: number; total: number; average?: number; periods: Periods }
  goalsAgainst: { home: number; away: number; total: number; average?: number; periods: Periods }
  cleanSheets: { home: number; away: number; total: number }
  failedToScore: { home: number; away: number; total: number }
  biggestWin?: { home?: string; away?: string }
  biggestLoss?: { home?: string; away?: string }
  streak?: { wins: number; draws: number; loses: number }
  penalty?: { scored: number; missed: number; total: number }
  yellow: Periods
  red: Periods
  formations: { formation: string; played: number }[]
  form?: string
}

/** Our own count of the same season (src/data/stats.ts), as far as the check below needs it */
interface OwnSeason {
  played: number
  longest: { wins: number; draws: number; losses: number }
  byInterval?: { scored: number[]; conceded: number[] }
  everyGoalTimed: boolean
}

/** Our six quarter-hours under the source's names for them (stoppage time counts in the half it belongs to) */
const OWN_PERIODS = ['0-15', '16-30', '31-45', '46-60', '61-75', '76-90']

/**
 * The source's team statistics with our own numbers where the source's don't add up. Its runs of
 * wins and defeats follow the round numbers, not the dates (a postponed match breaks a run that
 * was never broken), and its goals per quarter-hour give an own goal to the wrong side, so they
 * don't sum to the goals. Ours come from the matches as they were played – used when we have
 * every match the source has counted (and, for the quarter-hours, the minute of every goal).
 */
export function checkedTeamStats(stats: TeamStats, own: OwnSeason | undefined): TeamStats {
  if (!own || own.played < stats.played.total) return stats
  const every = own.everyGoalTimed ? (own.byInterval ?? { scored: [], conceded: [] }) : undefined
  const periods = (values: number[]): Periods => OWN_PERIODS.map((period, i) => ({ period, value: values[i] ?? 0 }))
  return {
    ...stats,
    streak: { wins: own.longest.wins, draws: own.longest.draws, loses: own.longest.losses },
    ...(every && {
      goalsFor: { ...stats.goalsFor, periods: periods(every.scored) },
      goalsAgainst: { ...stats.goalsAgainst, periods: periods(every.conceded) },
    }),
  }
}

/** A score as the source writes it ("3-1", home team first): the winner's margin and goals, seen from the team at home or away */
function margin(score: string | undefined, at: 'home' | 'away'): { score: string; by: number; goals: number } | undefined {
  const m = /^(\d+)\s*-\s*(\d+)$/.exec(score ?? '')
  if (!m) return undefined
  const [own, other] = at === 'home' ? [Number(m[1]), Number(m[2])] : [Number(m[2]), Number(m[1])]
  return { score: score!, by: own - other, goals: own }
}

/** The bigger of the home and the away result: the wider margin, then the most goals ("0-5" away beats "3-1" at home) */
export function biggestOf(pair: { home?: string; away?: string } | undefined): string | undefined {
  const home = margin(pair?.home, 'home')
  const away = margin(pair?.away, 'away')
  if (!home || !away) return (home ?? away)?.score
  return away.by > home.by || (away.by === home.by && away.goals > home.goals) ? away.score : home.score
}

export interface Injury {
  playerId?: number
  player: string
  photo?: string
  teamId?: number
  team: string
  /** "Missing Fixture" (out) or "Questionable" */
  type: string
  reason: string
  fixtureId?: number
  date: string
}

/** Our Danish words for the source's reasons */
export function injuryReason(reason: string): string {
  const r = reason.toLowerCase()
  if (/red card|suspend/.test(r)) return r.includes('yellow') ? 'Karantæne (gule kort)' : 'Karantæne'
  if (/yellow card/.test(r)) return 'Karantæne (gule kort)'
  if (/knee/.test(r)) return 'Knæskade'
  if (/ankle/.test(r)) return 'Ankelskade'
  if (/hamstring/.test(r)) return 'Baglårsskade'
  if (/thigh/.test(r)) return 'Lårskade'
  if (/calf/.test(r)) return 'Lægskade'
  if (/groin/.test(r)) return 'Lyskeskade'
  if (/muscle/.test(r)) return 'Muskelskade'
  if (/back/.test(r)) return 'Rygskade'
  if (/shoulder/.test(r)) return 'Skulderskade'
  if (/foot/.test(r)) return 'Fodskade'
  if (/head|concussion/.test(r)) return 'Hovedskade'
  if (/achilles/.test(r)) return 'Akillesskade'
  if (/illness|sick|virus|flu/.test(r)) return 'Sygdom'
  if (/cruciate|acl/.test(r)) return 'Korsbåndsskade'
  if (/broken|fracture/.test(r)) return 'Brud'
  if (/knock|bruise|contusion/.test(r)) return 'Slag'
  if (/fitness/.test(r)) return 'Mangler form'
  if (/inactive|coach/.test(r)) return 'Ikke udtaget'
  if (/injury/.test(r)) return 'Skade'
  if (/personal|family/.test(r)) return 'Personlige årsager'
  if (/international/.test(r)) return 'Landsholdsopgaver'
  return reason
}
