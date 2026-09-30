import { groupBursts } from './quality.ts'

// Picking photos without doing it by hand – pure (tests/photos/best.test.ts):
//  - bestOfMatch: the N best safe photos of one match: sharp, celebrations first,
//    many different own players, one per burst
//  - postFor: a draft post with the result and goal scorers, and the best safe
//    photo of an own scorer (else the best celebration, else the best photo)

export interface Candidate {
  id: number
  matchKey: string
  takenAt?: string | null
  dhash?: string | null
  sharpness?: number | null
  situation?: string | null
  approved: boolean
  /** Own players with a sure name on the photo */
  players: string[]
}

const CELEBRATION = /jubel|fejring|glæde|målscor|cheer|celebrat/i

export function score(c: Candidate, maxSharp: number) {
  const sharp = maxSharp > 0 ? (c.sharpness ?? 0) / maxSharp : 0
  return sharp * 50 + (CELEBRATION.test(c.situation ?? '') ? 25 : 0) + (c.approved ? 15 : 0) + Math.min(c.players.length, 3) * 5
}

export function bestOfMatch(candidates: Candidate[], n = 10, perPlayer = 2): number[] {
  // One per burst: keep only the sharpest of each group
  const drop = new Set(groupBursts(candidates).flatMap((g) => g.slice(1)))
  const pool = candidates.filter((c) => !drop.has(c.id))
  const maxSharp = Math.max(0, ...pool.map((c) => c.sharpness ?? 0))
  const ranked = [...pool].sort((a, b) => score(b, maxSharp) - score(a, maxSharp) || a.id - b.id)
  const used = new Map<string, number>()
  const out: number[] = []
  const late: number[] = []
  for (const c of ranked) {
    // Spread over players: a photo whose every player is already shown twice waits
    if (c.players.length && c.players.every((p) => (used.get(p) ?? 0) >= perPlayer)) {
      late.push(c.id)
      continue
    }
    out.push(c.id)
    for (const p of c.players) used.set(p, (used.get(p) ?? 0) + 1)
    if (out.length === n) return out
  }
  return [...out, ...late].slice(0, n)
}

export interface Goal {
  own: boolean
  minute: number | null
  name: string
}

export function postText(o: { own: string; opponent: string; ownGoals: number; oppGoals: number; home: boolean; goals: Goal[]; credit: string }) {
  const [h, a] = o.home ? [o.own, o.opponent] : [o.opponent, o.own]
  const [hs, as] = o.home ? [o.ownGoals, o.oppGoals] : [o.oppGoals, o.ownGoals]
  const list = (own: boolean) =>
    o.goals
      .filter((g) => g.own === own)
      .map((g) => `${g.name}${g.minute != null ? ` ${g.minute}'` : ''}`)
      .join(', ')
  const verdict = o.ownGoals > o.oppGoals ? 'Sejr' : o.ownGoals < o.oppGoals ? 'Nederlag' : 'Uafgjort'
  const lines = [`${verdict}: ${h} ${hs}-${as} ${a}`]
  if (list(true)) lines.push(`Mål ${o.own}: ${list(true)}`)
  if (list(false)) lines.push(`Mål ${o.opponent}: ${list(false)}`)
  lines.push('', `Foto: ${o.credit}`)
  return lines.join('\n')
}

/** The photo for the post: an own scorer (the scorer of most goals first), else a celebration, else the best */
export function postPhoto(candidates: Candidate[], ownScorers: string[]): { id?: number; scorer?: string } {
  const maxSharp = Math.max(0, ...candidates.map((c) => c.sharpness ?? 0))
  const best = (cs: Candidate[]) => [...cs].sort((a, b) => score(b, maxSharp) - score(a, maxSharp) || a.id - b.id)[0]
  const counts = new Map<string, number>()
  for (const s of ownScorers) counts.set(s, (counts.get(s) ?? 0) + 1)
  for (const scorer of [...counts.keys()].sort((a, b) => counts.get(b)! - counts.get(a)!)) {
    const c = best(candidates.filter((x) => x.players.includes(scorer)))
    if (c) return { id: c.id, scorer }
  }
  const c = best(candidates.filter((x) => CELEBRATION.test(x.situation ?? ''))) ?? best(candidates)
  return { id: c?.id }
}
