import 'server-only'
import { sameLeagueKeys } from '../data/baselines'
import { normalize } from '../data/aliases'
import { playerPath } from '../data/player'
import type { TeamEntry } from '../data/teams'
import { apiTeamIdOf, apiTeamPlayers, apiTeamSquad, externalLeague, type SquadPlayer } from './apisports'
import { proxyImage } from './imageProxy'

// The Danes abroad's photos and player pages (/danskere-i-udlandet): each player found in his club's squad from the
// match data's source (the saved line-ups, and the season's player list kept a day) by name – "Pierre-Emile Højbjerg"
// is "P. Højbjerg" there – or by the id James gave him. The source has a photo of every player under his id.

const words = (s: string) => normalize(s).split(/[\s-]+/).filter(Boolean)

/** Whether the source's name ("P. Højbjerg", "Mika Biereth") is the player's full name */
export function sameName(full: string, source: string): boolean {
  const a = words(full)
  const b = words(source.replace(/\./g, ' '))
  if (!a.length || !b.length) return false
  if (a.join(' ') === b.join(' ')) return true
  // The last names must agree, the first by its initial at least
  const last = (x: string[], n: number) => x.slice(-n).join(' ')
  const tail = b.slice(1)
  if (!tail.length || last(a, tail.length) !== tail.join(' ')) return false
  return a[0][0] === b[0][0]
}

/** A club's squad at the source (id and name), for James to find a player the names don't match on */
export async function abroadSquad(team: TeamEntry | undefined): Promise<{ id: number; name: string }[]> {
  if (!team?.leagueSlug || team.sport !== 'soccer') return []
  const league = sameLeagueKeys(team.leagueSlug).map(externalLeague).find(Boolean)
  const teamId = league ? apiTeamIdOf(league.id, team.names ?? [team.name]) : undefined
  if (!league || !teamId) return []
  const all = [...apiTeamSquad(league.id, teamId), ...((await apiTeamPlayers(league.id, teamId).catch(() => undefined)) ?? [])]
  return [...new Map(all.filter((p) => p.id).map((p) => [p.id!, { id: p.id!, name: p.name }])).values()]
}

export interface AbroadFace {
  photo?: string
  href?: string
}

/** A player's photo and page, from the id James gave or his club's squad */
export async function abroadFace(name: string, team: TeamEntry | undefined, apiId?: number): Promise<AbroadFace> {
  let id = apiId
  if (!id && team?.leagueSlug && team.sport === 'soccer') {
    const league = sameLeagueKeys(team.leagueSlug).map(externalLeague).find(Boolean)
    const teamId = league ? apiTeamIdOf(league.id, team.names ?? [team.name]) : undefined
    if (league && teamId) {
      const squad: SquadPlayer[] = [...apiTeamSquad(league.id, teamId), ...((await apiTeamPlayers(league.id, teamId).catch(() => undefined)) ?? [])]
      id = squad.find((p) => p.id && sameName(name, p.name))?.id
    }
  }
  return id ? { photo: proxyImage(`https://media.api-sports.io/football/players/${id}.png`), href: playerPath(id, name) } : {}
}
