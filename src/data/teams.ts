import type { SportId } from '../types'
import { DIVISIONS, sportOf, type Club, type Division } from './leagues'
import { seasonClubs } from './season'
import { getRealData } from './real'
import { divisionOfGame } from './ourLeagues'
import { danishLeagueName, externalLeagueKey, type ExternalGame } from './external'
import { ourClubByName, ourClubInGame } from './cups'
import { BASELINES, sameLeagueKeys } from './baselines'
import { alike, nameWords, normalize } from './aliases'
import { slugify } from '../lib/slug'
import { SHOWN_WOMEN, isInternational, shownTeam, womenMarked } from './countries'

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
  /** The league name its address was made from, when it isn't `league` (the source's own, before our Danish name for it) */
  slugLeague?: string
  logo?: string
}

/** "Brondby W", "HB Køge Women" -> the club part, for matching a women's team across sources */
const clubPart = (name: string) => name.replace(/\b(w|women|kvinder|dame|damer|q)\b\.?|\(k\)/gi, '').trim()

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

/** Addresses made from a league's Danish name by mistake (see `add` below) -> the team's real address */
const movedSlugs = new Map<string, string>()
/** Where a team's page is, when the address asked for is one it had by mistake */
export const movedTeamSlug = (slug: string): string | undefined => (teams(), movedSlugs.get(slug))

/** API-Sports' teams in their other leagues, and the teams of the starting tables (src/data/baselines.ts) */
function externalTeams(taken: Set<string>): TeamEntry[] {
  const out = new Map<string, TeamEntry>()
  const add = (name: string, e: Omit<TeamEntry, 'slug' | 'name'>) => {
    const key = `${e.leagueSlug}|${name}`
    if (out.has(key)) return
    // Its own address: the plain name when free, else with the league (the women's "Brøndby IF" is not the men's)
    let slug = slugify(name)
    if (taken.has(slug) || resemblesOurClub(name)) slug = `${slug}-${slugify(e.slugLeague ?? e.league)}`
    if (taken.has(slug)) slug = `${slug}-${slugify(e.country ?? '')}`
    taken.add(slug)
    // Shown under its Danish name (national teams, "(K)" for women's teams – every team of a women's league); found under the source's too
    const shown = womenMarked(shownTeam(name, e.country), e.league)
    const team: TeamEntry = { slug, name: shown, ...e, names: shown === name ? [name] : [name, shown] }
    // The address it had for some hours on 4 October 2026, made from our Danish name for the league: sent on to the real one
    if (e.slugLeague && e.slugLeague !== e.league && slug.endsWith(`-${slugify(e.slugLeague)}`)) movedSlugs.set(`${slugify(name)}-${slugify(e.league)}`, slug)
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
  const place = (name: string, logo: string | undefined, e: { sport: SportId; league: string; leagueSlug: string; country?: string; slugLeague?: string }, g?: ExternalGame) => {
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
    // National teams only by their exact name: "Guyana" is not "French Guyana", "Dominica" not the "Dominican Republic",
    // the "US Virgin Islands" not the "British Virgin Islands", and "South Africa" not "South Africa U23"
    const tiers = isInternational(e.country)
      ? [inLeague.filter((t) => known(t).includes(name))]
      : [
          inLeague.filter((t) => known(t).some((n) => n === name || normalize(clubPart(n)) === part)),
          inLeague.filter((t) => alike(known(t).map(clubPart), clubPart(name))),
          inLeague.filter((t) => alike([clubPart(t.name)], clubPart(name))),
        ]
    const same = tiers.find((t) => t.length === 1)
    if (same) {
      const t = same[0]
      for (const n of [name, shownTeam(name, e.country)]) if (!t.names!.includes(n)) t.names!.push(n)
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
    const e = { sport: g.sport, league: g.league.name, leagueSlug: externalLeagueKey(g.league), country: g.league.country, slugLeague: g.league.slugName }
    for (const side of [g.home, g.away]) place(side.name, side.logo, e, g)
  }
  // The rest of the leagues' tables: teams without a game in the fetched days
  const t2 = Date.now()
  for (const [leagueSlug, l] of Object.entries(getRealData()?.tableTeams ?? {})) {
    // The league by our Danish name for it; the address from the source's own, as before
    for (const t of l.teams) place(t.name, t.logo, { sport: l.sport, league: danishLeagueName(l.league, l.country) ?? l.league, leagueSlug, country: l.country, slugLeague: l.league })
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

/**
 * What the register is built from, as one number: every team (league and name) and
 * whether it has a logo, in any order. New real data arrives every half minute
 * (live scores), but the teams in it rarely change – and the rebuild takes half a
 * second with every page waiting, so it only happens when this changes.
 */
function teamSignature(external: ExternalGame[] | undefined): number {
  // Every team once: a team playing three games, or a new game of a team we have, changes nothing
  // (before, every game counted, so each new game or each day falling off rebuilt the register)
  const keys = new Set<string>()
  for (const g of external ?? []) {
    const league = `${g.league.id}|${g.league.name}|${g.league.country ?? ''}`
    keys.add(`${league}|${g.home.name}|${g.home.logo ? 1 : 0}`)
    keys.add(`${league}|${g.away.name}|${g.away.logo ? 1 : 0}`)
  }
  let sum = keys.size
  for (const key of keys) {
    let h = 2166136261
    for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619)
    sum = (sum + (h >>> 0)) % Number.MAX_SAFE_INTEGER
  }
  return sum
}

// Rebuilt when the season changes, or the teams in the real data do (not for every new score)
type Register = { clubs: ReturnType<typeof seasonClubs>; signature: number; external?: ExternalGame[]; list: TeamEntry[]; bySlug: Map<string, TeamEntry>; byName: Map<string, TeamEntry>; byLeagueName: Map<string, TeamEntry> }
let cache: Register | undefined
// The last few registers by what they were built from: the site process swings between two sets of games (the merged
// data from the job, and the same with the live games the pages fetch every 15 seconds, some without their logos), and
// each swing rebuilt the register – 0.7 seconds with every page waiting, every minute or two on a match evening
const recent: Register[] = []
function teams() {
  const clubs = seasonClubs()
  const external = getRealData()?.external
  // The signature is only worked out when the data is another object (also when a page adds games in the browser)
  const signature = cache && cache.external === external && cache.clubs === clubs ? cache.signature : teamSignature(external)
  if (!cache || cache.clubs !== clubs || cache.signature !== signature) {
    const known = recent.find((r) => r.clubs === clubs && r.signature === signature)
    if (known) {
      cache = known
      cache.external = external
      return cache
    }
    const started = Date.now()
    const why = !cache ? 'første gang' : cache.clubs !== clubs ? 'ny sæsondata' : `nye hold (signatur ${cache.signature} → ${signature})`
    const list = build()
    if (typeof window === 'undefined' && Date.now() - started > 500) console.log(`[data] klubregister bygget forfra (${why}), ${Date.now() - started} ms`)
    // By every name a team goes by; our clubs first, so a shared name ("Brøndby IF") stays theirs
    const byName = new Map<string, TeamEntry>()
    // And by league and name: the same name is another team in another league or sport (AGF's handball team is not AGF's footballers)
    const byLeagueName = new Map<string, TeamEntry>()
    for (const t of list)
      for (const n of t.names ?? [t.name]) {
        if (!byName.has(n)) byName.set(n, t)
        if (t.leagueSlug && !byLeagueName.has(`${t.leagueSlug}|${n}`)) byLeagueName.set(`${t.leagueSlug}|${n}`, t)
      }
    cache = { clubs, signature, external, list, bySlug: new Map(list.map((t) => [t.slug, t])), byName, byLeagueName }
    recent.unshift(cache)
    recent.length = Math.min(recent.length, 4)
  } else if (cache.external !== external) {
    cache.external = external
  }
  return cache
}

export const allTeams = () => teams().list
export const teamBySlug = (slug: string) => teams().bySlug.get(slug)

/** In the browser: the server's name index, so a link never needs the whole register built there */
const browserIndex = () => (typeof window === 'undefined' ? undefined : getRealData()?.teamIndex)
// '' = the name's own slug; 'w' = its slug as the source writes a women's team ("Paris FC (K)" is paris-fc-w);
// 'slug' = another slug; 'slug|Name' = a team shown under another name (a name it also goes by)
const sourceSlug = (name: string) => slugify(name.replace(SHOWN_WOMEN, ' W'))
const fromIndex = (name: string, value: string | undefined) => {
  if (value === undefined) return undefined
  const bar = value.indexOf('|')
  return (bar < 0 ? { slug: value === 'w' ? sourceSlug(name) : value || slugify(name), name } : { slug: value.slice(0, bar), name: value.slice(bar + 1) }) as TeamEntry
}

/** A team by its name; with the league the name is from, the team of that league first (the same name can be another team elsewhere) */
export const teamByName = (name: string, leagueSlug?: string): TeamEntry | undefined => {
  const index = browserIndex()
  if (index) {
    const own = leagueSlug ? index[`${leagueSlug}|${name}`] : undefined
    if (own !== undefined) return fromIndex(name, own)
    if (name in index) return fromIndex(name, index[name])
    // The index has a team under the name we show: the source's own name ("Scotland", "Paris FC W") finds it too
    const shown = shownTeam(name, 'World')
    return fromIndex(shown, index[shown])
  }
  const t = teams()
  return (leagueSlug ? t.byLeagueName.get(`${leagueSlug}|${name}`) : undefined) ?? t.byName.get(name)
}

/** Every team name's slug, '' when it is the name's own slug, and the team's name when it is shown under another (sent to the browser as RealData.teamIndex) */
let nameIndex: { for: Map<string, TeamEntry>; index: Record<string, string> } | undefined
export function teamNameIndex(): Record<string, string> {
  // Made once per register (the layout asks for it on every page; it took up to 100 ms each time)
  const byName = teams().byName
  if (nameIndex?.for === byName) return nameIndex.index
  const index: Record<string, string> = {}
  for (const [name, t] of byName) {
    // A name we show differently ("Scotland" as "Skotland") is found through the shown one (teamByName), so the list is no longer
    const shown = shownTeam(name, 'World')
    if (shown !== name && byName.get(shown) === t) continue
    index[name] = t.name !== name ? `${t.slug}|${t.name}` : t.slug === slugify(name) ? '' : t.slug === sourceSlug(name) ? 'w' : t.slug
  }
  // A name that is another team in another league: that team under "<league>|<name>" (few, so the list stays short)
  for (const [key, t] of teams().byLeagueName) {
    const name = key.slice(key.indexOf('|') + 1)
    if (byName.get(name) !== t) index[key] = t.name !== name ? `${t.slug}|${t.name}` : t.slug
  }
  nameIndex = { for: byName, index }
  return index
}

/** For a women's team of one of our clubs ("FC Copenhagen W" in the A-Liga): that club's id */
export function womenOf(team: TeamEntry): string | undefined {
  if (team.season) return undefined
  if (!/\b(w|women|kvinder|dame|damer)\b|\(k\)/i.test(team.name) && !/kvinde|women|frauen|a-liga|damallsvenskan|toppserien/i.test(team.league)) return undefined
  return ourClubByName(clubPart(team.name), team.sport)?.club.id
}

/** The women's team of one of our clubs, by the club's id */
export function womenTeamOf(clubId: string): TeamEntry | undefined {
  return teams().list.find((t) => womenOf(t) === clubId)
}

/** A team in one of API-Sports' leagues, by a name from that league's data or table */
export function teamInLeague(leagueSlug: string, name: string, sport?: SportId): TeamEntry | undefined {
  if (typeof window !== 'undefined') {
    const pairs = getRealData()?.leagueTeamIndex
    if (pairs) return fromIndex(name, pairs[`${leagueSlug}|${name}`])
  }
  const inLeague = teams().list.filter((t) => t.leagueSlug === leagueSlug)
  // One of our clubs by its exact name ("Real Madrid" in the Champions League)
  const ours = sport && ourClubByName(name, sport)
  return (
    inLeague.find((t) => (t.names ?? [t.name]).includes(name)) ??
    (ours ? teamBySlug(ours.club.slug) : undefined) ??
    (() => {
      // Not for national teams (see externalTeams): only their exact names
      if (isInternational(inLeague[0]?.country)) return undefined
      const loose = inLeague.filter((t) => alike([clubPart(t.name)], clubPart(name)))
      return loose.length === 1 ? loose[0] : undefined
    })()
  )
}
