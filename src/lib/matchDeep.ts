import 'server-only'
import type { ExternalGame } from '../data/external'
import type { Match } from '../types'
import { winChance, type LastXI, type MatchDeep, type ScoredGame, type SeasonPlayer } from '../data/matchDeep'
import { allFixtures, isFinished } from '../data/season'
import { findClub } from '../data/matchInsights'
import { shownTeam } from '../data/countries'
import { apiTeamStats, lastStartingLineup, leagueSeasonGames } from './apisports'
import { teamPlayerTotals } from './archive'
import { lineupPhotos, playerFaces } from './playerPhotos'

// The match page's deeper numbers (src/data/matchDeep.ts): everything from what is saved – the season's games,
// the statistics bank's player numbers and the line-ups kept with the games – plus the clubs' season statistics
// (one cached lookup per club a day, as on the club pages). Never more than a moment's wait.

function within<T>(p: Promise<T>, ms = 1500): Promise<T | undefined> {
  return Promise.race([p.catch(() => undefined), new Promise<undefined>((r) => setTimeout(() => r(undefined), ms))])
}

/** The season's finished games for the calculation: our own season for our leagues (our names), else the source's */
function scoredGames(match: Match, games: ExternalGame[]): { list: ScoredGame[]; home: string; away: string } | undefined {
  const division = findClub(match.home.name)?.division
  if (division && findClub(match.away.name)?.division.id === division.id) {
    const list = allFixtures()
      .filter((f) => f.division?.id === division.id && isFinished(f))
      .map((f) => ({ home: f.home.name, away: f.away.name, homeGoals: f.score[0], awayGoals: f.score[1] }))
    if (list.length) return { list, home: match.home.name, away: match.away.name }
  }
  if (!games.length) return undefined
  return {
    list: games.map((g) => ({ home: String(g.home.id ?? g.home.name), away: String(g.away.id ?? g.away.name), homeGoals: g.homeScore ?? 0, awayGoals: g.awayScore ?? 0 })),
    home: '',
    away: '',
  }
}

/** A club's players this season in the league, with photo; the ones who have played */
function seasonPlayers(games: ExternalGame[], teamId: number, team: string): SeasonPlayer[] {
  const ids = games.filter((g) => g.home.id === teamId || g.away.id === teamId).map((g) => g.id)
  const rows = teamPlayerTotals(ids, teamId).filter((p) => p.minutes > 0)
  const faces = playerFaces(rows.map((p) => ({ name: p.name, team, id: p.id })))
  return rows.map((p, i) => ({ ...p, photo: faces[i]?.photo }))
}

function lastXI(teamId: number, before: string, country?: string): LastXI | undefined {
  const found = lastStartingLineup('football', teamId, before)
  if (!found) return undefined
  const { lineup, game } = found
  const home = game.home.id === teamId
  return {
    lineup: lineupPhotos([lineup])?.[0] ?? lineup,
    against: shownTeam(home ? game.away.name : game.home.name, country ?? game.league.country),
    date: game.kickoff.slice(0, 10),
    home,
  }
}

/** The match page's deeper numbers, for a football match the source has (else only the calculation from our season) */
export async function matchDeep(match: Match, game?: ExternalGame): Promise<MatchDeep | undefined> {
  if (match.sport !== 'soccer') return undefined
  const football = game && game.id.startsWith('football-') && game.home.id && game.away.id ? game : undefined
  const leagueId = football ? String(football.league.id) : undefined
  const season = football?.league.season
  const games = football && leagueId ? leagueSeasonGames('football', leagueId, season) : []

  const [home, away] = football && leagueId
    ? await Promise.all([within(apiTeamStats(leagueId, football.home.id!, season)), within(apiTeamStats(leagueId, football.away.id!, season))])
    : [undefined, undefined]

  const players = football ? { home: seasonPlayers(games, football.home.id!, football.home.name), away: seasonPlayers(games, football.away.id!, football.away.name) } : undefined
  const xi = football && match.state === 'upcoming' ? { home: lastXI(football.home.id!, football.kickoff, football.league.country), away: lastXI(football.away.id!, football.kickoff, football.league.country) } : undefined

  // The calculation: from our own season for our leagues, else the source's games by team id
  const scored = scoredGames(match, games)
  const chance = scored
    ? scored.home
      ? winChance(scored.list, scored.home, scored.away)
      : football
        ? winChance(scored.list, String(football.home.id), String(football.away.id))
        : undefined
    : undefined

  const deep: MatchDeep = {
    ...(home || away ? { teamStats: { home, away } } : {}),
    ...(players && (players.home.length || players.away.length) ? { players } : {}),
    ...(xi && (xi.home || xi.away) ? { lastXI: xi } : {}),
    ...(chance ? { chance } : {}),
  }
  return Object.keys(deep).length ? deep : undefined
}
