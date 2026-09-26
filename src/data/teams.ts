import type { SportId } from '../types'
import { DIVISIONS, sportOf, type Club, type Division } from './leagues'
import { seasonClubs } from './season'
import { getRealData } from './real'
import { divisionOfGame } from './ourLeagues'
import { externalLeagueKey } from './external'
import { BASELINES } from './baselines'
import { alike } from './aliases'
import { slugify } from '../lib/slug'

// One register of every team playing in the leagues we show (from the real
// season). Every team automatically gets a page at /klub/<slug>, links from
// match pages, a place on /klubber and in the sitemap. Clubs missing from
// our club list (src/data/leagues.ts etc.) are included with a plain badge.

export interface TeamEntry {
  slug: string
  name: string
  sport: SportId
  league: string
  /** Set when the league has its own page */
  leagueSlug?: string
  country?: string
  colors?: [string, string]
  /** Present for clubs in the leagues we cover, which have full season data */
  season?: { club: Club; division: Division }
  /** API-Sports' teams: every name the team goes by in the match data */
  names?: string[]
  logo?: string
}

/** "Brondby W", "HB Køge Women" -> the club part, for matching a women's team across sources */
const clubPart = (name: string) => name.replace(/\b(w|women|kvinder|dame|damer|q)\b\.?/gi, '').trim()

/** Whether a name looks like one of our clubs ("F.C. København" for the women's team): its page then carries the league in its address */
function resemblesOurClub(name: string) {
  const part = clubPart(name)
  return DIVISIONS.some((d) => d.clubs.some((c) => DIVISIONS_SLUGS.has(slugify(name)) || alike([c.name, c.originalName ?? c.name], part)))
}
const DIVISIONS_SLUGS = new Set(DIVISIONS.flatMap((d) => d.clubs.map((c) => c.slug)))

/** API-Sports' teams in their other leagues, and the teams of the starting tables (src/data/baselines.ts) */
function externalTeams(taken: Set<string>): TeamEntry[] {
  const out = new Map<string, TeamEntry>()
  const add = (name: string, e: Omit<TeamEntry, 'slug' | 'name'>) => {
    const key = `${e.leagueSlug}|${name}`
    if (out.has(key)) return
    // Its own address: the plain name when free, else with the league (the women's "Brøndby IF" is not the men's)
    let slug = slugify(name)
    if (taken.has(slug) || resemblesOurClub(name)) slug = `${slug}-${slugify(e.league)}`
    if (taken.has(slug)) slug = `${slug}-${slugify(e.country ?? '')}`
    taken.add(slug)
    out.set(key, { slug, name, ...e, names: [name] })
  }
  const byLeague = (leagueSlug: string) => [...out.values()].filter((t) => t.leagueSlug === leagueSlug)
  // The starting tables first, with the leagues' own names for the teams
  for (const [key, b] of Object.entries(BASELINES)) {
    for (const r of b.rows) add(r.name, { sport: b.league.sport, league: b.league.name, leagueSlug: key, country: b.league.country })
  }
  for (const g of getRealData()?.external ?? []) {
    if (divisionOfGame(g)) continue
    const leagueSlug = externalLeagueKey(g.league)
    for (const side of [g.home, g.away]) {
      // The same team in a starting table: API-Sports' name joins it ("Brondby W" -> "Brøndby IF")
      const known = byLeague(leagueSlug).filter((t) => (t.names ?? [t.name]).some((n) => n === side.name) || alike([clubPart(t.name)], clubPart(side.name)))
      if (known.length === 1) {
        const t = known[0]
        if (!t.names!.includes(side.name)) t.names!.push(side.name)
        t.logo ??= side.logo
        continue
      }
      add(side.name, { sport: g.sport, league: g.league.name, leagueSlug, country: g.league.country, logo: side.logo })
    }
  }
  return [...out.values()]
}

function build(): TeamEntry[] {
  const ours = seasonClubs().map(({ club, division }): TeamEntry => ({
    slug: club.slug,
    name: club.name,
    sport: sportOf(division),
    league: division.name,
    leagueSlug: division.slug,
    country: division.country,
    colors: club.colors,
    season: { club, division },
  }))
  return [...ours, ...externalTeams(new Set(ours.map((t) => t.slug)))]
}

// Rebuilt when the season changes (new real data)
let cache: { clubs: ReturnType<typeof seasonClubs>; version?: string; list: TeamEntry[]; bySlug: Map<string, TeamEntry>; byName: Map<string, TeamEntry> } | undefined
function teams() {
  const clubs = seasonClubs()
  const version = getRealData()?.version
  if (cache?.clubs !== clubs || cache.version !== version) {
    const list = build()
    // By every name a team goes by; our clubs first, so a shared name ("Brøndby IF") stays theirs
    const byName = new Map<string, TeamEntry>()
    for (const t of list) for (const n of t.names ?? [t.name]) if (!byName.has(n)) byName.set(n, t)
    cache = { clubs, version, list, bySlug: new Map(list.map((t) => [t.slug, t])), byName }
  }
  return cache
}

export const allTeams = () => teams().list
export const teamBySlug = (slug: string) => teams().bySlug.get(slug)
export const teamByName = (name: string) => teams().byName.get(name)

/** A team in one of API-Sports' leagues, by a name from that league's data or table */
export function teamInLeague(leagueSlug: string, name: string): TeamEntry | undefined {
  const inLeague = teams().list.filter((t) => t.leagueSlug === leagueSlug)
  return (
    inLeague.find((t) => (t.names ?? [t.name]).includes(name)) ??
    (() => {
      const loose = inLeague.filter((t) => alike([clubPart(t.name)], clubPart(name)))
      return loose.length === 1 ? loose[0] : undefined
    })()
  )
}
