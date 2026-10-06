import 'server-only'
import type { Division } from '../data/club'
import type { LeagueDeep, LeagueOut, LeaguePlayer, LeagueStatus } from '../data/leagueDeep'
import { sportOf } from '../data/leagues'
import { allFixtures, clubInDivision, isFinished, toMatch } from '../data/season'
import { getRealData } from '../data/real'
import { channelsFor } from '../data/channels'
import { apiInjuries, apiLeagueIdOf, leagueSeasonGames } from './apisports'
import { leaguePlayerTotals } from './archive'
import { playerFaces } from './playerPhotos'
import type { ExternalGame } from '../data/external'
import { externalMatch } from '../data/matches'

// The league page's deeper numbers (src/data/leagueDeep.ts): from the season's fixtures, the statistics bank's player
// numbers and the source's injury list (one cached lookup per league, as on the match pages). Never a long wait.

const DAY = 86_400_000

function within<T>(p: Promise<T>, ms = 1500): Promise<T | undefined> {
  return Promise.race([p.catch(() => undefined), new Promise<undefined>((r) => setTimeout(() => r(undefined), ms))])
}

/** Live now, the next match – after a break the next round's days –, or the season is over */
function status(division: Division, now: number): LeagueStatus {
  const fixtures = allFixtures().filter((f) => f.division?.id === division.id)
  const live = fixtures.filter((f) => toMatch(f, now).state === 'live').length
  if (live) return { kind: 'live', count: live }
  const next = fixtures.filter((f) => !isFinished(f) && f.kickoff.getTime() > now && f.real?.state !== 'postponed').sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime())[0]
  if (!next) return { kind: 'over' }
  const last = fixtures.filter((f) => isFinished(f) && f.kickoff.getTime() <= now).at(-1)
  const m = toMatch(next, now)
  // A break: more than 2 days to go and at least 10 days since the last round (in football the national teams play then)
  const gap = last ? next.kickoff.getTime() - last.kickoff.getTime() : 0
  const round = next.round ? fixtures.filter((f) => f.round === next.round) : [next]
  const days = round.map((f) => f.kickoff.getTime()).sort((a, b) => a - b)
  const breakUntil =
    next.kickoff.getTime() - now > 2 * DAY && gap >= 10 * DAY
      ? { from: new Date(days[0]).toISOString(), to: new Date(days.at(-1)!).toISOString(), round: next.round || undefined, international: sportOf(division) === 'soccer' }
      : undefined
  return { kind: 'next', home: m.home.name, away: m.away.name, kickoff: next.kickoff.toISOString(), slug: m.slug, channels: channelsFor(m).map((c) => c.name), breakUntil }
}

/** Rounds played and the regular season's length (each club's games) */
function rounds(division: Division): { played: number; total: number } {
  const n = division.clubs.length
  const meetings = division.meetings ?? 2
  const finished = allFixtures().filter((f) => f.division?.id === division.id && isFinished(f))
  const perClub = new Map<string, number>()
  for (const f of finished) for (const c of [f.home.id, f.away.id]) perClub.set(c, (perClub.get(c) ?? 0) + 1)
  return { played: Math.max(0, ...perClub.values()), total: (n - 1) * meetings }
}

const top = (list: LeaguePlayer[], by: (p: LeaguePlayer) => number, ok: (p: LeaguePlayer) => boolean = () => true) =>
  list.filter((p) => ok(p) && by(p) > 0).sort((a, b) => by(b) - by(a) || b.minutes - a.minutes).slice(0, 5)

export async function leagueDeep(division: Division, now: number): Promise<LeagueDeep> {
  const deep: LeagueDeep = { status: status(division, now), round: rounds(division) }
  const leagueId = sportOf(division) === 'soccer' ? apiLeagueIdOf(division.id) : undefined
  if (!leagueId) return deep
  const names = getRealData()?.clubNames ?? {}
  const ours = (team: string) => clubInDivision(division, team, names)?.name

  // The players' season: the league's games since the season started
  const games = leagueSeasonGames('football', leagueId).filter((g) => g.kickoff >= division.seasonStart)
  const rows = leaguePlayerTotals(games.map((g) => g.id)).filter((p) => p.minutes > 0 && ours(p.team))
  if (rows.length) {
    const faces = playerFaces(rows.map((p) => ({ name: p.name, team: p.team, id: p.id })))
    const players: LeaguePlayer[] = rows.map((p, i) => ({ ...p, club: ours(p.team)!, photo: faces[i]?.photo }))
    const most = Math.max(...players.map((p) => p.apps))
    deep.players = {
      rating: top(players, (p) => p.rating ?? 0, (p) => p.apps >= Math.max(2, Math.ceil(most / 2))),
      chances: top(players, (p) => p.keyPasses),
      saves: top(players, (p) => p.saves),
      shotsOn: top(players, (p) => p.shotsOn),
    }
  }

  // Out for the next ten days, by club, each player once (the latest word on him)
  const injuries = await within(apiInjuries(leagueId))
  if (injuries?.length) {
    const ahead = injuries.filter((i) => Date.parse(i.date) >= now - 6 * 3_600_000 && Date.parse(i.date) <= now + 10 * DAY)
    const byClub = new Map<string, Map<string, LeagueOut['players'][number]>>()
    for (const i of ahead.sort((a, b) => a.date.localeCompare(b.date))) {
      const club = ours(i.team)
      if (!club) continue
      const list = byClub.get(club) ?? new Map()
      if (!list.has(i.player)) list.set(i.player, { name: i.player, reason: i.reason, photo: i.photo, doubtful: i.type !== 'Missing Fixture' })
      byClub.set(club, list)
    }
    const out = [...byClub.entries()].map(([club, list]) => ({ club, players: [...list.values()] })).sort((a, b) => b.players.length - a.players.length)
    if (out.length) deep.out = out
  }
  return deep
}

/**
 * The same for one of the source's other leagues (Segunda División, Serie B …): where the season is from its
 * kept games, the players from the statistics bank and who is out from the injury list – all under the source's
 * team names, as its table has them.
 */
export async function externalLeagueDeep(
  league: { api: string; id: string; season?: string; sport: string },
  games: ExternalGame[],
  table: { teams: number; played: number },
  now: number,
): Promise<LeagueDeep> {
  // A league where everyone meets twice: the regular season's length
  const total = table.teams >= 4 ? (table.teams - 1) * 2 : 0
  // Where the season is: over only when every round is played (no game in the days we have can be a break)
  const live = games.filter((g) => g.state === 'live').length
  let state: LeagueStatus = total && table.played < total ? { kind: 'pause' } : { kind: 'over' }
  if (live) state = { kind: 'live', count: live }
  else {
    const next = games.filter((g) => g.state === 'upcoming' && Date.parse(g.kickoff) > now).sort((a, b) => a.kickoff.localeCompare(b.kickoff))[0]
    if (next) {
      const last = games.filter((g) => g.state === 'finished' && Date.parse(g.kickoff) <= now).sort((a, b) => a.kickoff.localeCompare(b.kickoff)).at(-1)
      const gap = last ? Date.parse(next.kickoff) - Date.parse(last.kickoff) : 0
      const sameRound = next.round ? games.filter((g) => g.round === next.round && g.state !== 'finished') : [next]
      const days = sameRound.map((g) => Date.parse(g.kickoff)).sort((a, b) => a - b)
      const roundNo = Number(/(\d+)\s*$/.exec(next.round ?? '')?.[1]) || undefined
      const m = externalMatch(next)
      state = {
        kind: 'next',
        home: m.home.name,
        away: m.away.name,
        kickoff: next.kickoff,
        slug: m.slug,
        channels: channelsFor(m).map((c) => c.name),
        breakUntil:
          Date.parse(next.kickoff) - now > 2 * DAY && gap >= 10 * DAY
            ? { from: new Date(days[0]).toISOString(), to: new Date(days.at(-1)!).toISOString(), round: roundNo, international: league.sport === 'soccer' }
            : undefined,
      }
    }
  }
  const deep: LeagueDeep = { status: state, round: { played: table.played, total: table.played <= total ? total : 0 } }
  if (!league.api.startsWith('football') || !league.id || league.id === 'db') return deep

  // The players' season in the league
  const season = leagueSeasonGames('football', league.id, league.season)
  const rows = leaguePlayerTotals(season.map((g) => g.id)).filter((p) => p.minutes > 0 && p.team)
  if (rows.length) {
    const faces = playerFaces(rows.map((p) => ({ name: p.name, team: p.team, id: p.id })))
    const players: LeaguePlayer[] = rows.map((p, i) => ({ ...p, club: p.team, photo: faces[i]?.photo }))
    const most = Math.max(...players.map((p) => p.apps))
    deep.players = {
      rating: top(players, (p) => p.rating ?? 0, (p) => p.apps >= Math.max(2, Math.ceil(most / 2))),
      chances: top(players, (p) => p.keyPasses),
      saves: top(players, (p) => p.saves),
      shotsOn: top(players, (p) => p.shotsOn),
    }
  }

  // Out for the next ten days, by team
  const injuries = await within(apiInjuries(league.id))
  if (injuries?.length) {
    const ahead = injuries.filter((i) => Date.parse(i.date) >= now - 6 * 3_600_000 && Date.parse(i.date) <= now + 10 * DAY)
    const byClub = new Map<string, Map<string, LeagueOut['players'][number]>>()
    for (const i of ahead.sort((a, b) => a.date.localeCompare(b.date))) {
      const list = byClub.get(i.team) ?? new Map()
      if (!list.has(i.player)) list.set(i.player, { name: i.player, reason: i.reason, photo: i.photo, doubtful: i.type !== 'Missing Fixture' })
      byClub.set(i.team, list)
    }
    const out = [...byClub.entries()].map(([club, list]) => ({ club, players: [...list.values()] })).sort((a, b) => b.players.length - a.players.length)
    if (out.length) deep.out = out
  }
  return deep
}
