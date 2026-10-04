import 'server-only'
import type { RealData, RealEvent } from '../data/real'
import { getRealData } from '../data/real'
import { clubFixtures, seasonClubs, standings } from '../data/season'
import { isoDate } from './time'
import type { ExternalGame } from '../data/external'
import { externalLeagueKey } from '../data/external'
import { cupOfGame, wholeSeason } from '../data/cups'
import { teamInLeague, teamNameIndex } from '../data/teams'

// What the browser gets of the real data. The server keeps every game; the
// browser only needs the games in play (the live count in the menu), one game
// per cup and whole-season tournament (so menus and empty cup days look the
// same as on the server), and each page adds the games it shows (RealDataExtra:
// the front page its day). Team links come from a name index, so the browser
// never builds the whole team register.

let memo: { data: RealData; hour: number; out: RealData } | undefined

const DAY = 86_400_000

/**
 * The browser's share of our own leagues: the games from two days ago to eleven days ahead and those in play
 * (the day lists, the menu), and each club's latest result and next match (followed teams, the next game of
 * each league). The whole season of a league comes with the pages that show it (a club's, a match's).
 */
function clientLeagues(leagues: Record<string, RealEvent[]>, now: number): Record<string, RealEvent[]> {
  const from = now - 2 * DAY
  const until = now + 11 * DAY
  const out: Record<string, RealEvent[]> = {}
  for (const [id, events] of Object.entries(leagues)) {
    const keep = new Set<RealEvent>()
    const last = new Map<string, RealEvent>()
    const next = new Map<string, RealEvent>()
    for (const e of events) {
      const t = Date.parse(e.kickoff)
      if (e.state === 'live' || (t >= from && t <= until)) keep.add(e)
      for (const team of [e.home, e.away]) {
        if (e.state === 'finished' && t <= now && !(Date.parse(last.get(team)?.kickoff ?? '') >= t)) last.set(team, e)
        if (t > now && e.state !== 'postponed' && !(Date.parse(next.get(team)?.kickoff ?? '') <= t)) next.set(team, e)
      }
    }
    for (const e of [...last.values(), ...next.values()]) keep.add(e)
    out[id] = events.filter((e) => keep.has(e))
  }
  return out
}

/** Every club's place in its league table, by name (followed teams in the browser, which has only part of the season) */
function positions(now: number): Record<string, number> {
  const out: Record<string, number> = {}
  const done = new Set<string>()
  for (const { division } of seasonClubs()) {
    if (done.has(division.id)) continue
    done.add(division.id)
    standings(division, now).forEach((r, i) => (out[r.club.name] = i + 1))
  }
  return out
}

/** A page's own leagues in full: every league these clubs play in this season (a club's page, a match's) */
export function clubLeagues(clubIds: string[]): Record<string, RealEvent[]> {
  const leagues = getRealData()?.leagues ?? {}
  const ids = new Set(clubIds.flatMap((id) => clubFixtures(id).map((f) => f.division?.id).filter((x): x is string => !!x)))
  return Object.fromEntries([...ids].filter((id) => leagues[id]).map((id) => [id, leagues[id]]))
}

/**
 * A day list's games as the browser needs them for the list: the goals and red cards (no yellow cards), and
 * none of the match page's details (periods, stadium, referee). A match page adds its own game in full.
 */
export function listGames(games: ExternalGame[]): ExternalGame[] {
  return games.map((g) => {
    const { periods, stadium, referee, eventsFor, round, incidents, ...rest } = g
    void periods, stadium, referee, eventsFor, round
    const shown = incidents?.filter((i) => i.kind !== 'yellow')
    return { ...rest, ...(shown?.length && { incidents: shown }) }
  })
}

/** One day's games in our leagues (a day page outside the days the browser gets) */
export function leaguesOn(date: string): Record<string, RealEvent[]> {
  const out: Record<string, RealEvent[]> = {}
  for (const [id, events] of Object.entries(getRealData()?.leagues ?? {})) {
    const day = events.filter((e) => isoDate(new Date(e.kickoff)) === date)
    if (day.length) out[id] = day
  }
  return out
}

export function clientRealData(real: RealData | undefined): RealData | undefined {
  if (!real) return undefined
  const now = Date.now()
  // Again every hour as well: the days the browser gets move with the clock
  const hour = Math.floor(now / 3_600_000)
  if (memo?.data === real && memo.hour === hour) return memo.out
  const markers = new Map<string, ExternalGame>()
  const external = (real.external ?? []).filter((g) => {
    if (g.state === 'live') return true
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
    leagues: clientLeagues(real.leagues, now),
    positions: positions(now),
    // Only the server uses these
    tableTeams: undefined,
    checked: undefined,
    teamIndex: teamNameIndex(),
    leagueTeamIndex: {},
  }
  memo = { data: real, hour, out }
  return out
}

/** What a page adds for the browser: its games, and league-table names for team links */
export function realExtras(games: ExternalGame[], tables: { leagueSlug: string; names: string[]; sport?: import('../types').SportId }[] = []) {
  const leagueTeamIndex: Record<string, string> = {}
  for (const t of tables) {
    for (const name of t.names) {
      // Only teams with a page: a missing name means no link, as on the server
      const team = teamInLeague(t.leagueSlug, name, t.sport)
      if (team) leagueTeamIndex[`${t.leagueSlug}|${name}`] = team.name !== name ? `${team.slug}|${team.name}` : team.slug
    }
  }
  return { games, leagueTeamIndex }
}
