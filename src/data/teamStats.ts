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
