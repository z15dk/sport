import type { Club, Division } from './danishClubs'

// Deterministic building blocks for the fictional results.

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

export function poisson(lambda: number, rand: () => number) {
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

/**
 * Shuffles a copy of `items` with the seeded generator (Fisher-Yates). Never use
 * sort(() => rand() - 0.5): its result depends on the engine's sort algorithm,
 * so the server and the browser could end up with different fixtures.
 */
export function shuffle<T>(items: T[], rand: () => number): T[] {
  const list = [...items]
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[list[i], list[j]] = [list[j], list[i]]
  }
  return list
}

/** Pairs every club with another, in a different order per seed. */
export function pairClubs(clubs: Club[], rand: () => number): [Club, Club][] {
  const list = shuffle(clubs, rand)
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
