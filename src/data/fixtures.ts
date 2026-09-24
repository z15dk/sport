import type { Club, Division } from './danishClubs'

// Deterministic fictional results for the Danish divisions.

export function seeded(seed: number) {
  let s = seed % 2147483647
  if (s <= 0) s += 2147483646
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

export function hashString(str: string) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619)
  return Math.abs(h)
}

function poisson(lambda: number, rand: () => number) {
  const limit = Math.exp(-lambda)
  let k = 0
  let p = rand()
  while (p > limit) {
    k++
    p *= rand()
  }
  return Math.min(k, 7)
}

/** Goals for a match; stronger clubs (earlier in the division list) score more. */
export function playMatch(div: Division, home: Club, away: Club, rand: () => number): [number, number] {
  const n = div.clubs.length
  const strength = (club: Club) => 1 - div.clubs.indexOf(club) / (n - 1) // 1 = strongest
  const diff = strength(home) - strength(away)
  const lh = Math.max(0.35, 1.45 + 0.9 * diff + 0.15)
  const la = Math.max(0.3, 1.2 - 0.9 * diff)
  return [poisson(lh, rand), poisson(la, rand)]
}

/** Pairs every club with another, in a different order per seed. */
export function pairClubs(clubs: Club[], rand: () => number): [Club, Club][] {
  const list = [...clubs]
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[list[i], list[j]] = [list[j], list[i]]
  }
  const pairs: [Club, Club][] = []
  for (let i = 0; i + 1 < list.length; i += 2) pairs.push([list[i], list[i + 1]])
  return pairs
}

/** Round-robin schedule (circle method); round r returns [home, away] pairs. */
export function roundRobin(clubs: Club[], round: number): [Club, Club][] {
  const n = clubs.length
  const rest = clubs.slice(1)
  const r = round % (n - 1)
  const rotated = [clubs[0], ...rest.slice(r), ...rest.slice(0, r)]
  const pairs: [Club, Club][] = []
  for (let i = 0; i < n / 2; i++) {
    const a = rotated[i]
    const b = rotated[n - 1 - i]
    pairs.push(round % 2 === 0 ? [a, b] : [b, a])
  }
  return pairs
}

export interface StandingRow {
  club: Club
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  points: number
  form: ('V' | 'U' | 'T')[]
}

/** Fictional table after `rounds` rounds of the season. */
export function standings(div: Division, rounds: number): StandingRow[] {
  const rows = new Map<string, StandingRow>(
    div.clubs.map((club) => [
      club.id,
      { club, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0, form: [] },
    ]),
  )
  for (let r = 0; r < rounds; r++) {
    const rand = seeded(hashString(`${div.id}-season-${r}`))
    for (const [home, away] of roundRobin(div.clubs, r)) {
      const [hg, ag] = playMatch(div, home, away, rand)
      const h = rows.get(home.id)!
      const a = rows.get(away.id)!
      h.played++
      a.played++
      h.goalsFor += hg
      h.goalsAgainst += ag
      a.goalsFor += ag
      a.goalsAgainst += hg
      const result = (row: StandingRow, f: number, a: number) => {
        if (f > a) {
          row.won++
          row.points += 3
          row.form.push('V')
        } else if (f < a) {
          row.lost++
          row.form.push('T')
        } else {
          row.drawn++
          row.points++
          row.form.push('U')
        }
      }
      result(h, hg, ag)
      result(a, ag, hg)
    }
  }
  return [...rows.values()].sort(
    (x, y) =>
      y.points - x.points ||
      y.goalsFor - y.goalsAgainst - (x.goalsFor - x.goalsAgainst) ||
      y.goalsFor - x.goalsFor ||
      x.club.name.localeCompare(y.club.name, 'da'),
  )
}
