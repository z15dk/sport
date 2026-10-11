import 'server-only'
import { sameLeagueKeys } from '../data/baselines'
import { normalize } from '../data/aliases'
import { playerPath } from '../data/player'
import type { TeamEntry } from '../data/teams'
import { abroadTeam, readAbroad, setAbroadIds } from './abroad'
import { archivePlayersNamed } from './archive'
import { apiSearchPlayers, apiTeamIdOf, lineupPlayersNamed, apiTeamPlayers, apiTeamSquad, externalLeague, type SquadPlayer } from './apisports'
import { proxyImage } from './imageProxy'

// The Danes abroad's photos and player pages (/danskere-i-udlandet): each player's id at the match data's source – the
// one saved on him (James', or found by resolveAbroadIds), else found in his club's squad by name ("Pierre-Emile
// Højbjerg" is "P. Højbjerg" there). resolveAbroadIds looks up the rest in our own match archive and saved line-ups,
// then the source's player search (a Dane with the
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

/** A search hit is the player: a Dane whose full name at the source has every word of ours ("Joakim Mæhle" is "Joakim Mæhle Pedersen"), the first name at least as its start */
function sameProfile(full: string, p: { name: string; firstname?: string; lastname?: string; nationality?: string }): boolean {
  if (p.nationality && p.nationality !== 'Denmark') return false
  if (sameName(full, p.name)) return true
  const ours = words(full)
  const theirs = words(`${p.firstname ?? ''} ${p.lastname ?? ''}`)
  // "Matt" is "Matthew" there, "Jonas Wind" is "Jonas Older Wind"
  return ours.length > 1 && !!theirs[0]?.startsWith(ours[0]) && ours.slice(1).every((w) => theirs.includes(w))
}

/** The player's id in his club's squad, by name */
async function squadId(name: string, team: TeamEntry | undefined): Promise<number | undefined> {
  return (await abroadSquad(team).catch(() => [])).find((p) => sameName(name, p.name))?.id
}

/** The player's id from the saved line-ups (Denmark's games, the clubs' games): by his last name as written and without Danish letters ("Maehle") */
function lineupId(name: string): number | undefined {
  const last = name.trim().split(/\s+/).at(-1) ?? ''
  const plain = last.replace(/æ/gi, 'ae').replace(/ø/gi, 'o').replace(/å/gi, 'a')
  const ids = new Set<number>()
  for (const term of new Set([last, plain])) if (term.length >= 3) for (const p of lineupPlayersNamed(term)) if (sameName(name, p.name)) ids.add(p.id)
  return ids.size === 1 ? [...ids][0] : undefined
}

/**
 * The player's id from our own match archive (every saved match with its players): by his last name, as written and
 * without Danish letters; when two players fit, the one at his club now, else the one who played last.
 */
function archiveId(name: string, club: string): number | undefined {
  const last = name.trim().split(/\s+/).at(-1) ?? ''
  const plain = last.replace(/æ/gi, 'ae').replace(/ø/gi, 'o').replace(/å/gi, 'a')
  const hits = new Map<number, { team: string; last: string }>()
  for (const term of new Set([last, plain])) for (const p of archivePlayersNamed(term)) if (sameName(name, p.name) && !hits.has(p.id)) hits.set(p.id, p)
  if (hits.size <= 1) return [...hits.keys()][0]
  const clubWords = words(club.replace(/\(k\)/i, ''))
  const atClub = [...hits].filter(([, p]) => words(p.team).some((w) => w.length > 2 && clubWords.includes(w)))
  if (atClub.length === 1) return atClub[0][0]
  return [...hits].sort((a, b) => b[1].last.localeCompare(a[1].last))[0][0]
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
  // The search takes 4+ letters and no Danish ones ("Bah" and "Rønnow" are found by the first name)
  const terms = [...new Set([...parts.slice(1).reverse(), parts[0]].filter((w) => !/[æøå]/i.test(w) || w === parts[0]).map(searchable).filter((t) => t.length >= 4))].slice(0, 3)
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
      const id = (await squadId(p.name, abroadTeam(p.club))) ?? archiveId(p.name, p.club) ?? lineupId(p.name) ?? (await searchId(p.name).catch(() => undefined))
      if (id) found[p.name] = id
      else missing.push(`${p.name} (${p.club})`)
    }
    if (Object.keys(found).length) setAbroadIds(found)
    return { found: Object.keys(found).length, missing }
  })().finally(() => (resolving = undefined))
  return resolving
}
