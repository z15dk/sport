import 'server-only'
import { sameLeagueKeys } from '../data/baselines'
import { normalize } from '../data/aliases'
import { playerPath } from '../data/player'
import type { TeamEntry } from '../data/teams'
import { abroadTeam, readAbroad, setAbroadIds } from './abroad'
import { apiSearchPlayers, apiTeamIdOf, apiTeamPlayers, apiTeamSquad, externalLeague, type SquadPlayer } from './apisports'
import { proxyImage } from './imageProxy'

// The Danes abroad's photos and player pages (/danskere-i-udlandet): each player's id at the match data's source – the
// one saved on him (James', or found by resolveAbroadIds), else found in his club's squad by name ("Pierre-Emile
// Højbjerg" is "P. Højbjerg" there). resolveAbroadIds looks up the rest in the source's player search (a Dane with the
// same last name and first initial) and saves the ids, so the page never waits on it. The source has a photo of every
// player under his id.

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

/** A search hit is the player: a Dane whose full name at the source has every word of ours ("Joakim Mæhle" is "Joakim Mæhle Pedersen") with the same first name */
function sameProfile(full: string, p: { name: string; firstname?: string; lastname?: string; nationality?: string }): boolean {
  if (p.nationality && p.nationality !== 'Denmark') return false
  if (sameName(full, p.name)) return true
  const ours = words(full)
  const theirs = words(`${p.firstname ?? ''} ${p.lastname ?? ''}`)
  return ours.length > 1 && theirs[0] === ours[0] && ours.every((w) => theirs.includes(w))
}

/** The player's id in his club's squad, by name */
async function squadId(name: string, team: TeamEntry | undefined): Promise<number | undefined> {
  return (await abroadSquad(team).catch(() => [])).find((p) => sameName(name, p.name))?.id
}

/** A word as the source's search takes it: letters a–z only ("Mæhle" → "Maehle") */
const searchable = (w: string) =>
  w
    .replace(/æ/gi, 'ae')
    .replace(/ø/gi, 'o')
    .replace(/å/gi, 'aa')
    .normalize('NFKD')
    .replace(/[^a-z0-9]/gi, '')

/** The player's id from the source's player search: by each of his names, the last first (it searches last names) */
async function searchId(name: string): Promise<number | undefined> {
  const parts = name.trim().split(/[\s-]+/).filter(Boolean)
  const terms = [...new Set([...parts.slice(1).reverse(), parts[0]].map(searchable).filter((t) => t.length >= 3))].slice(0, 3)
  for (const term of terms) {
    const hits = ((await apiSearchPlayers(term)) ?? []).filter((p) => sameProfile(name, p))
    if (hits.length === 1) return hits[0].id
  }
  return undefined
}

let resolving: Promise<{ found: number; missing: string[] }> | undefined
/** Finds and saves the ids of the players who have none (the squad first, then the search); one run at a time */
export function resolveAbroadIds(): Promise<{ found: number; missing: string[] }> {
  resolving ??= (async () => {
    const found: Record<string, number> = {}
    const missing: string[] = []
    for (const p of readAbroad().players) {
      if (p.apiId) continue
      const id = (await squadId(p.name, abroadTeam(p.club))) ?? (await searchId(p.name).catch(() => undefined))
      if (id) found[p.name] = id
      else missing.push(`${p.name} (${p.club})`)
    }
    if (Object.keys(found).length) setAbroadIds(found)
    return { found: Object.keys(found).length, missing }
  })().finally(() => (resolving = undefined))
  return resolving
}
