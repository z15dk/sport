import 'server-only'
import type { RealData } from '../data/real'
import type { ExternalGame } from '../data/external'
import { externalLeagueKey } from '../data/external'
import { cupOfGame, wholeSeason } from '../data/cups'
import { teamInLeague, teamNameIndex } from '../data/teams'
import { isoDate } from './time'

// What the browser gets of the real data. The server keeps every game; the
// browser only needs today (the live count in the menu), one game per cup and whole-season tournament (so menus and empty
// cup days look the same as on the server), and each page adds the games it
// shows beyond that (RealDataExtra). Team links come from a name index, so the
// browser never builds the whole team register.

let memo: { data: RealData; out: RealData } | undefined

export function clientRealData(real: RealData | undefined): RealData | undefined {
  if (!real) return undefined
  if (memo?.data === real) return memo.out
  const today = isoDate(Date.now())
  const markers = new Map<string, ExternalGame>()
  const external = (real.external ?? []).filter((g) => {
    if (g.state === 'live' || isoDate(new Date(g.kickoff)) === today) return true
    if (cupOfGame(g) || wholeSeason(g)) {
      const key = externalLeagueKey(g.league)
      if (!markers.has(key)) markers.set(key, g)
    }
    return false
  })
  const inWindow = new Set(external.map((g) => externalLeagueKey(g.league)))
  for (const [key, g] of markers) if (!inWindow.has(key)) external.push(g)
  const out: RealData = {
    ...real,
    external,
    // Only the server uses these
    tableTeams: undefined,
    checked: undefined,
    teamIndex: teamNameIndex(),
    leagueTeamIndex: {},
  }
  memo = { data: real, out }
  return out
}

/** What a page adds for the browser: its games, and league-table names for team links */
export function realExtras(games: ExternalGame[], tables: { leagueSlug: string; names: string[]; sport?: import('../types').SportId }[] = []) {
  const leagueTeamIndex: Record<string, string> = {}
  for (const t of tables) {
    for (const name of t.names) {
      // Only teams with a page: a missing name means no link, as on the server
      const team = teamInLeague(t.leagueSlug, name, t.sport)
      if (team) leagueTeamIndex[`${t.leagueSlug}|${name}`] = team.slug
    }
  }
  return { games, leagueTeamIndex }
}
