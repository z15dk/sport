import 'server-only'
import type { Leaders, Lineup } from '../data/matchExtra'
import { alike, normalize } from '../data/aliases'
import { playersByName } from './archive'
import { realLogo } from './logoCheck'

// Photos (and player pages) for lists that only know a scorer's name and team:
// the league's player lists from our partners first, then the players saved
// in the statistics bank under that name. No photo: the list shows the club's logo.

export interface PlayerFace {
  id?: number
  photo?: string
}

const sameTeam = (a: string, b: string) => normalize(a) === normalize(b) || alike([a], b) || alike([b], a)

/** The photo and id for each row, in the same order (football only) */
export function playerFaces(rows: { name: string; team: string; id?: number }[], leaders?: Leaders): PlayerFace[] {
  const listed = leaders ? [...leaders.scorers, ...leaders.assists, ...leaders.yellow, ...leaders.red] : []
  const saved = playersByName(rows.filter((r) => !r.id).map((r) => r.name))
  return rows.map((r) => {
    const fromList = listed.find((l) => (r.id ? l.id === r.id : normalize(l.name) === normalize(r.name) && sameTeam(l.team, r.team)))
    if (fromList?.photo) return { id: fromList.id, photo: fromList.photo }
    let id = r.id ?? fromList?.id
    if (!id) {
      const players = saved.get(r.name) ?? []
      const ids = [...new Set(players.filter((p) => sameTeam(p.team, r.team)).map((p) => p.id))]
      const any = [...new Set(players.map((p) => p.id))]
      id = ids.length === 1 ? ids[0] : !ids.length && any.length === 1 ? any[0] : undefined
    }
    return { id, photo: id ? realLogo(`https://media.api-sports.io/football/players/${id}.png`) : undefined }
  })
}

/** The line-ups with each player's photo (by id, else by name and team in the statistics bank) */
export function lineupPhotos(lineups: Lineup[] | undefined): Lineup[] | undefined {
  return lineups?.map((l) => {
    const faces = playerFaces([...l.startXI, ...l.substitutes].map((p) => ({ name: p.name, team: l.team, id: p.id })))
    let i = 0
    const withFace = (p: Lineup['startXI'][number]) => {
      const f = faces[i++]
      return { ...p, id: p.id ?? f?.id, photo: f?.photo }
    }
    return { ...l, startXI: l.startXI.map(withFace), substitutes: l.substitutes.map(withFace) }
  })
}
