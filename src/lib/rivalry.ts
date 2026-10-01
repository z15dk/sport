import 'server-only'
import type { Club } from '../data/club'
import type { Division } from '../data/leagues'
import { allFixtures, isFinished, seasonClubs, standings, toMatch, type Fixture } from '../data/season'
import { realHeadToHead, withMatchLinks } from './history'
import type { PastMatch } from '../data/matchInsights'
import type { Match } from '../types'
import { isoDate } from './time'

// Head-to-head pages (SEO, "fck brøndby", "agf mod aab indbyrdes"): every
// meeting between two of our clubs, the record, the next meeting. One page per
// pair at /opgoer/<a>-mod-<b> with the slugs in alphabetical order; the other
// order redirects there. Indexed (and in the sitemap) from MIN_INDEXED meetings.

export const MIN_INDEXED = 3
const SEP = '-mod-'

export const rivalryPath = (a: string, b: string) => {
  const [x, y] = [a, b].sort()
  return `/opgoer/${x}${SEP}${y}`
}

/** The two club slugs of an address, in the order written */
export function parseRivalry(slug: string): [string, string] | undefined {
  const i = slug.indexOf(SEP)
  if (i <= 0) return undefined
  const a = slug.slice(0, i)
  const b = slug.slice(i + SEP.length)
  return a && b && a !== b ? [a, b] : undefined
}

const clubBySlug = (slug: string) => seasonClubs().find((x) => x.club.slug === slug)

export interface Rivalry {
  a: { club: Club; division: Division }
  b: { club: Club; division: Division }
  /** Every meeting, newest first */
  meetings: PastMatch[]
  record: { a: number; draw: number; b: number; goalsA: number; goalsB: number }
  /** Club a at home / away */
  home: { a: { w: number; d: number; l: number }; b: { w: number; d: number; l: number } }
  biggestA?: PastMatch
  biggestB?: PastMatch
  mostGoals?: PastMatch
  next?: Match
  /** Both in the same league this season: their places */
  table?: { a: number; b: number; division: Division }
  since?: Date
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

/** This season's fixtures by pair of clubs, made once per fixture list */
let byPair: { fixtures: Fixture[]; map: Map<string, Fixture[]> } | undefined
function pairFixtures(a: Club, b: Club): Fixture[] {
  const fixtures = allFixtures()
  if (byPair?.fixtures !== fixtures) {
    const map = new Map<string, Fixture[]>()
    for (const f of fixtures) {
      const k = pairKey(f.home.id, f.away.id)
      const list = map.get(k)
      if (list) list.push(f)
      else map.set(k, [f])
    }
    byPair = { fixtures, map }
  }
  return byPair.map.get(pairKey(a.id, b.id)) ?? []
}

/** The pair's meetings: the match database and statistics bank, topped up with this season's played matches (the same match once) */
function meetingsOf(a: Club, b: Club, now: number, links: boolean): PastMatch[] {
  const db = realHeadToHead(a, b, new Date(now + 86_400_000), 10_000) ?? []
  const seen = new Set(db.map((m) => `${isoDate(m.date)}|${m.homeScore}-${m.awayScore}`))
  const season: PastMatch[] = pairFixtures(a, b)
    .filter((f) => isFinished(f) && f.kickoff.getTime() <= now && !seen.has(`${isoDate(f.kickoff)}|${f.score[0]}-${f.score[1]}`))
    .map((f) => ({ date: f.kickoff, competition: f.competition, home: f.home.name, away: f.away.name, homeScore: f.score[0], awayScore: f.score[1], slug: f.slug }))
  const all = [...season, ...db].sort((x, y) => y.date.getTime() - x.date.getTime())
  return links ? withMatchLinks(all) : all
}

const nextMeeting = (a: Club, b: Club, now: number): Fixture | undefined =>
  pairFixtures(a, b)
    .filter((f) => !isFinished(f) && f.kickoff.getTime() > now - 3 * 3_600_000)
    .sort((x, y) => x.kickoff.getTime() - y.kickoff.getTime())[0]

const cache = new Map<string, { at: number; value: Rivalry | undefined }>()

/** The pair's page data, by the two club slugs (either order); kept a few minutes */
export function rivalry(slugA: string, slugB: string, now = Date.now()): Rivalry | undefined {
  const [x, y] = [slugA, slugB].sort()
  const key = `${x}|${y}`
  const hit = cache.get(key)
  if (hit && now - hit.at < 5 * 60_000) return hit.value
  const value = build(x, y, now)
  cache.set(key, { at: now, value })
  if (cache.size > 2000) cache.delete(cache.keys().next().value as string)
  return value
}

function build(slugA: string, slugB: string, now: number): Rivalry | undefined {
  const a = clubBySlug(slugA)
  const b = clubBySlug(slugB)
  if (!a || !b) return undefined
  const meetings = meetingsOf(a.club, b.club, now, true)
  const next = nextMeeting(a.club, b.club, now)
  if (!meetings.length && !next) return undefined
  const isA = (name: string) => name === a.club.name
  const record = { a: 0, draw: 0, b: 0, goalsA: 0, goalsB: 0 }
  const home = { a: { w: 0, d: 0, l: 0 }, b: { w: 0, d: 0, l: 0 } }
  let biggestA: PastMatch | undefined
  let biggestB: PastMatch | undefined
  let mostGoals: PastMatch | undefined
  for (const m of meetings) {
    const aHome = isA(m.home)
    const ga = aHome ? m.homeScore : m.awayScore
    const gb = aHome ? m.awayScore : m.homeScore
    record.goalsA += ga
    record.goalsB += gb
    const r = ga > gb ? 'w' : ga < gb ? 'l' : 'd'
    if (r === 'w') record.a++
    else if (r === 'l') record.b++
    else record.draw++
    // Club a's record at home, and b's at home (a away)
    if (aHome) home.a[r]++
    else home.b[r === 'w' ? 'l' : r === 'l' ? 'w' : 'd']++
    const margin = (p?: PastMatch) => (p ? Math.abs(p.homeScore - p.awayScore) : -1)
    if (ga > gb && ga - gb > margin(biggestA)) biggestA = m
    if (gb > ga && gb - ga > margin(biggestB)) biggestB = m
    if (!mostGoals || m.homeScore + m.awayScore > mostGoals.homeScore + mostGoals.awayScore) mostGoals = m
  }
  let table: Rivalry['table']
  if (a.division.id === b.division.id) {
    const rows = standings(a.division, now)
    const pa = rows.findIndex((r) => r.club.id === a.club.id)
    const pb = rows.findIndex((r) => r.club.id === b.club.id)
    if (pa >= 0 && pb >= 0) table = { a: pa + 1, b: pb + 1, division: a.division }
  }
  return { a, b, meetings, record, home, biggestA, biggestB, mostGoals, next: next && toMatch(next, now), table, since: meetings.at(-1)?.date }
}

/** The pairs worth a page in the sitemap: clubs of the same league with at least MIN_INDEXED meetings */
export function rivalryPairs(now = Date.now()): { path: string; meetings: number; last?: Date }[] {
  const byDivision = new Map<string, Club[]>()
  for (const { club, division } of seasonClubs()) byDivision.set(division.id, [...(byDivision.get(division.id) ?? []), club])
  const out: { path: string; meetings: number; last?: Date }[] = []
  for (const clubs of byDivision.values()) {
    for (let i = 0; i < clubs.length; i++)
      for (let j = i + 1; j < clubs.length; j++) {
        // Counted only (no page built): the sitemap goes through every pair of every league
        const meetings = meetingsOf(clubs[i], clubs[j], now, false)
        if (meetings.length >= MIN_INDEXED) out.push({ path: rivalryPath(clubs[i].slug, clubs[j].slug), meetings: meetings.length, last: meetings[0]?.date })
      }
  }
  return out
}

/** A club's head-to-head pages with the other clubs of its league (links from the club page) */
export function clubRivalries(club: Club, division: Division, now = Date.now()) {
  return seasonClubs()
    .filter((x) => x.division.id === division.id && x.club.id !== club.id)
    .map((x) => ({ other: x.club, r: rivalry(club.slug, x.club.slug, now) }))
    .filter((x): x is { other: Club; r: Rivalry } => !!x.r && x.r.meetings.length >= 1)
    .map((x) => ({ path: rivalryPath(club.slug, x.other.slug), other: x.other, meetings: x.r.meetings.length, record: x.r.a.club.id === club.id ? x.r.record : { a: x.r.record.b, draw: x.r.record.draw, b: x.r.record.a, goalsA: x.r.record.goalsB, goalsB: x.r.record.goalsA } }))
    .sort((x, y) => y.meetings - x.meetings)
}
