import type { SportId } from '../types'
import { DIVISIONS, sportOf, type Club, type Division } from './leagues'
import { seasonClubs } from './season'
import { getRealData } from './real'
import { divisionOfGame } from './ourLeagues'
import { externalLeagueKey, type ExternalGame } from './external'
import { ourClubByName, ourClubInGame } from './cups'
import { BASELINES, sameLeagueKeys } from './baselines'
import { alike, nameWords, normalize } from './aliases'
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

/** Every word of our clubs' names, once (the check below runs for every team API-Sports sends) */
let ourWords: Set<string> | undefined
const DIVISIONS_SLUGS = new Set(DIVISIONS.flatMap((d) => d.clubs.map((c) => c.slug)))

/** Whether a name looks like one of our clubs ("F.C. København" for the women's team): its page then carries the league in its address */
function resemblesOurClub(name: string) {
  if (DIVISIONS_SLUGS.has(slugify(name))) return true
  ourWords ??= new Set(DIVISIONS.flatMap((d) => d.clubs.flatMap((c) => nameWords(c.originalName ?? c.name))))
  const words = nameWords(clubPart(name))
  return words.length > 0 && words.every((w) => ourWords!.has(w))
}

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
    const team: TeamEntry = { slug, name, ...e, names: [name] }
    out.set(key, team)
    if (e.leagueSlug) (inLeagueSlug.get(e.leagueSlug) ?? inLeagueSlug.set(e.leagueSlug, []).get(e.leagueSlug)!).push(team)
  }
  // The teams by league, so a lookup doesn't go through every team
  const inLeagueSlug = new Map<string, TeamEntry[]>()
  // A league API-Sports lists under two names (A-Liga / Kvindeliga) is one league
  const byLeague = (leagueSlug: string) => sameLeagueKeys(leagueSlug).flatMap((k) => inLeagueSlug.get(k) ?? [])
  // The starting tables first, with the leagues' own names for the teams (once, under the league's main key)
  const tables = new Set<object>()
  // The tables' other names for a team, only for recognising it in API-Sports' games
  const aliases = new Map<TeamEntry, string[]>()
  const known = (t: TeamEntry) => [...(t.names ?? [t.name]), ...(aliases.get(t) ?? [])]
  const t0 = Date.now()
  for (const [key, b] of Object.entries(BASELINES)) {
    if (tables.has(b)) continue
    tables.add(b)
    for (const r of b.rows) {
      add(r.name, { sport: b.league.sport, league: b.league.name, leagueSlug: key, country: b.league.country })
      const t = out.get(`${key}|${r.name}`)
      if (t && r.aliases) aliases.set(t, r.aliases)
    }
  }
  // A team from API-Sports (a game or a table): our club, a team we have in that league, or a new one
  // A team plays many games: each team (league and name) is placed once
  const placed = new Set<string>()
  const place = (name: string, logo: string | undefined, e: { sport: SportId; league: string; leagueSlug: string; country?: string }, g?: ExternalGame) => {
    const seen = `${e.leagueSlug}|${name}`
    if (placed.has(seen)) {
      // Only a logo the first game lacked
      const t = logo && out.get(seen)
      if (t) t.logo ??= logo
      return
    }
    placed.add(seen)
    // Our own clubs in a cup or the Champions League keep their own page, as does a team with exactly one of our clubs' names
    if (ourClubInGame(g ?? { sport: e.sport, league: { id: '', name: e.league, country: e.country } }, name)) return
    // The same team in a starting table: API-Sports' name joins it ("Brondby W" -> "Brøndby IF")
    // The same name first ("FC Copenhagen W" is the table's "F.C. København", also known as "FC Copenhagen"), then a looser likeness
    const inLeague = byLeague(e.leagueSlug)
    const part = normalize(clubPart(name))
    const tiers = [
      inLeague.filter((t) => known(t).some((n) => n === name || normalize(clubPart(n)) === part)),
      inLeague.filter((t) => alike(known(t).map(clubPart), clubPart(name))),
      inLeague.filter((t) => alike([clubPart(t.name)], clubPart(name))),
    ]
    const same = tiers.find((t) => t.length === 1)
    if (same) {
      const t = same[0]
      if (!t.names!.includes(name)) t.names!.push(name)
      t.logo ??= logo
      return
    }
    add(name, { ...e, logo })
  }
  const t1 = Date.now()
  let games = 0
  for (const g of getRealData()?.external ?? []) {
    games++
    if (divisionOfGame(g)) continue
    const e = { sport: g.sport, league: g.league.name, leagueSlug: externalLeagueKey(g.league), country: g.league.country }
    for (const side of [g.home, g.away]) place(side.name, side.logo, e, g)
  }
  // The rest of the leagues' tables: teams without a game in the fetched days
  const t2 = Date.now()
  for (const [leagueSlug, l] of Object.entries(getRealData()?.tableTeams ?? {})) {
    for (const t of l.teams) place(t.name, t.logo, { sport: l.sport, league: l.league, leagueSlug, country: l.country })
  }
  const t3 = Date.now()
  // Where the time goes when the register is slow (server log, see realdata.ts warm())
  if (typeof window === 'undefined' && t3 - t0 > 500)
    console.log(`[data] klubregister: udgangspunkter ${t1 - t0} ms, ${games} kampe ${t2 - t1} ms, tabeller ${t3 - t2} ms, ${placed.size} hold`)
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
export function teamInLeague(leagueSlug: string, name: string, sport?: SportId): TeamEntry | undefined {
  const inLeague = teams().list.filter((t) => t.leagueSlug === leagueSlug)
  // One of our clubs by its exact name ("Real Madrid" in the Champions League)
  const ours = sport && ourClubByName(name, sport)
  return (
    inLeague.find((t) => (t.names ?? [t.name]).includes(name)) ??
    (ours ? teamBySlug(ours.club.slug) : undefined) ??
    (() => {
      const loose = inLeague.filter((t) => alike([clubPart(t.name)], clubPart(name)))
      return loose.length === 1 ? loose[0] : undefined
    })()
  )
}
