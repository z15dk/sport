import type { Match, SportFilter, SportId } from '../types'
import { addDays } from '../lib/time'
import { clubFixtures, clubInDivision, fixturesOn, seasonClub, toMatch } from './season'
import { getRealData } from './real'
import { WOMEN_TEAM, externalToMatch, isWomenLeague, gameKey, isWomenGame, type ExternalGame } from './external'

export { isWomenGame }
import { alike, clubNames, normalize } from './aliases'
import { divisionOfGame } from './ourLeagues'
import { DIVISIONS, sportOf } from './leagues'
import { cupOfGame, ourClubInGame, wholeSeason } from './cups'
import { isoDate } from '../lib/time'
import { matchSlug } from '../lib/slug'
import { sameLeagueKeys } from './baselines'
import { countryKey } from './channels'

/** An API-Sports game as a match, placed in our league when it is one of ours (and with our clubs' names in a cup) */
export function externalMatch(g: ExternalGame): Match {
  // Our clubs under their own names in the cup, the European tournaments and friendlies (not a women's or youth team of the same name)
  const ours = (name: string) => (divisionOfGame(g) ? undefined : ourClubInGame(g, name)?.club)
  const home = ours(g.home.name)
  const away = ours(g.away.name)
  if (wholeSeason(g) || home || away) {
    const renamed = { ...g, home: home ? { ...g.home, name: home.name, logo: undefined } : g.home, away: away ? { ...g.away, name: away.name, logo: undefined } : g.away }
    const m = externalToMatch(renamed)
    const teams = { home: { ...m.home, colors: home?.colors ?? m.home.colors }, away: { ...m.away, colors: away?.colors ?? m.away.colors } }
    // One cup, whichever source the game comes from, right after the country's leagues
    return cupOfGame(g) ? { ...m, ...cupPlace(m.leagueSlug), ...teams } : { ...m, ...teams }
  }
  const own = divisionOfGame(g)
  if (!own) return externalToMatch(g)
  const { d, i } = own
  // A game in one of our leagues that the season doesn't have: our clubs under their own names, logos and colours ("Gladsaxe" is Gladsaxe Basketball)
  const names = getRealData()?.clubNames ?? {}
  const homeClub = clubInDivision(d, g.home.name, names)
  const awayClub = clubInDivision(d, g.away.name, names)
  const m = externalToMatch({
    ...g,
    home: homeClub ? { ...g.home, name: homeClub.name, logo: undefined } : g.home,
    away: awayClub ? { ...g.away, name: awayClub.name, logo: undefined } : g.away,
  })
  return {
    ...m,
    league: d.name,
    leagueId: `${d.countryCode.toLowerCase()}-${d.id}`,
    leagueSlug: d.slug,
    leagueOrder: i,
    country: d.country,
    home: { ...m.home, colors: homeClub?.colors ?? m.home.colors },
    away: { ...m.away, colors: awayClub?.colors ?? m.away.colors },
  }
}

/** A cup's place in the lists: one group (all sources), right after the country's own football leagues */
export function cupPlace(leagueSlug?: string): { leagueId: string; leagueOrder: number } {
  const last = DIVISIONS.map((d, i) => ({ d, i })).filter(({ d }) => d.countryCode === 'DK' && sportOf(d) === 'soccer').at(-1)?.i ?? 0
  return { leagueId: `cup-${leagueSlug ?? ''}`, leagueOrder: last + 0.5 }
}

// Matches for the front page, match pages and club pages, all from the
// real season in season.ts.

/** Matches from the full league seasons (football, ice hockey, basketball) */
function leagueMatches(date: string, sport: SportId, now: number): Match[] {
  return fixturesOn(date)
    .filter((f) => f.sport === sport)
    .map((f) => toMatch(f, now))
}

const ALL_SPORTS: SportId[] = ['soccer', 'basketball', 'ice_hockey', 'handball', 'volleyball', 'american_football']

/** The names a club goes by (ours, TheSportsDB's, search aliases), for matching games across sources */
export function namesOf(name: string) {
  const club = seasonClub(name)?.club
  return club ? [...new Set([name, ...clubNames(club)])] : [name]
}

/**
 * The day's matches: our leagues' season, updated with API-Sports' live score
 * where API-Sports has the same match, plus API-Sports' games in other leagues.
 */
// API-Sports' games by Danish date, built once per data version: finding a
// day's games no longer turns every game's kick-off into a date (that made
// the front page, which asks for many days and sports, take seconds)
const byDay = new WeakMap<ExternalGame[], Map<string, ExternalGame[]>>()
/** Friendlies (national teams, clubs, youth): no table, only the day's matches */
export const isFriendly = (league: string) => /friendl|venskab/i.test(league)

/** The other games of a league on a Danish date ("Friendlies" today), as sent to the browser */
export function leagueGamesOn(date: string, league: string, sport: Match['sport']): ExternalGame[] {
  return externalOn(date).filter((g) => g.sport === sport && externalMatch(g).league === league)
}

/** API-Sports' games on a Danish date */
export function externalOn(date: string): ExternalGame[] {
  const all = getRealData()?.external ?? []
  let days = byDay.get(all)
  if (!days) {
    days = new Map()
    for (const g of all) {
      const d = isoDate(new Date(g.kickoff))
      const list = days.get(d)
      if (list) list.push(g)
      else days.set(d, [g])
    }
    byDay.set(all, days)
  }
  return days.get(date) ?? []
}

/**
 * The day's matches of a sport: ours with the other sources' live scores, and
 * the other sources' own games. Worked out once per data and half minute (a
 * page asks for the same day many times, and a day has thousands of games);
 * callers get their own copy of the list.
 */
const dayCache = new WeakMap<object, Map<string, Match[]>>()
export function getMatches(date: string, sport: SportFilter, now: number): Match[] {
  const data = getRealData()
  if (!data) return matchesOf(date, sport, now)
  const byData = dayCache.get(data) ?? dayCache.set(data, new Map()).get(data)!
  const key = `${date}|${sport}|${Math.floor(now / 30_000)}`
  let list = byData.get(key)
  if (!list) {
    if (byData.size > 400) byData.clear()
    list = matchesOf(date, sport, now)
    byData.set(key, list)
  }
  return list.slice()
}

function matchesOf(date: string, sport: SportFilter, now: number): Match[] {
  if (sport === 'all') return ALL_SPORTS.flatMap((s) => getMatches(date, s, now))
  const ours = leagueMatches(date, sport, now)
  const external = externalOn(date).filter((g) => g.sport === sport)
  if (!external.length) return ours
  const byKey = new Map<string, number>()
  ours.forEach((m, i) => {
    for (const h of namesOf(m.home.name)) for (const a of namesOf(m.away.name)) byKey.set(gameKey(m.kickoff, h, a), i)
  })
  const extra: ExternalGame[] = []
  const taken = new Set<number>()
  const names = ours.map((m) => ({ home: namesOf(m.home.name), away: namesOf(m.away.name) }))
  // Loose matching only for games that can be one of ours: from our leagues' countries (the thousands of other games
  // around the world never are, and comparing each of them with every one of our matches made pages slow)
  const countries = new Set(ours.map((m) => countryKey(m.country)))
  const mayBeOurs = (g: ExternalGame) => countries.has('') || countries.has(countryKey(g.league.country)) || !!divisionOfGame(g)
  for (const g of external) {
    let i = byKey.get(gameKey(g.kickoff, g.home.name, g.away.name))
    // Names written differently ("Holbæk B and I" / "Holbæk B&I"): same day and each side shares a word
    if (i === undefined && mayBeOurs(g)) {
      const loose = ours.flatMap((_, j) =>
        !taken.has(j) && alike(names[j].home, g.home.name) && alike(names[j].away, g.away.name) ? [j] : [],
      )
      if (loose.length === 1) i = loose[0]
      // One team alike in the same league that day (a team plays once a day): "Bayern Munich" / "FC Bayern München"
      const league = divisionOfGame(g)?.d
      if (i === undefined && league) {
        const either = ours.flatMap((m, j) =>
          !taken.has(j) && m.leagueSlug === league.slug && (alike(names[j].home, g.home.name) || alike(names[j].away, g.away.name)) ? [j] : [],
        )
        if (either.length === 1) i = either[0]
      }
    }
    if (i !== undefined) taken.add(i)
    if (i === undefined) {
      extra.push(g)
      continue
    }
    // Same match: API-Sports' live state and score win until our source has the final result
    const m = ours[i]
    // Goals and cards from API-Sports where our source has none
    if (!m.incidents?.length && g.incidents?.length) ours[i] = { ...m, incidents: g.incidents }
    const oursFinal = m.state === 'finished' && m.home.score !== undefined
    if (!oursFinal && (g.state === 'live' || g.state === 'finished') && g.homeScore !== undefined && g.awayScore !== undefined) {
      const x = externalToMatch(g)
      ours[i] = { ...m, state: x.state, statusLabel: x.statusLabel, winner: x.winner, home: { ...m.home, score: g.homeScore }, away: { ...m.away, score: g.awayScore } }
    }
  }
  return [...ours, ...extra.map(externalMatch)]
}


export function findMatch(slug: string, date: string, now: number): Match | undefined {
  for (const sport of ALL_SPORTS) {
    const m = getMatches(date, sport, now).find((x) => x.slug === slug)
    if (m) return m
  }
  // An address from the source's own team names ("bakken-bears-gladsaxe-…" before Gladsaxe got its club's name): the same match
  const g = (getRealData()?.external ?? []).find((x) => isoDate(new Date(x.kickoff)) === date && matchSlug(x.home.name, x.away.name, date) === slug)
  return g ? externalMatch(g) : undefined
}

/** A league club's games outside its league (cup, Champions League), as the source has them */
export function clubExternalGames(clubName: string): ExternalGame[] {
  return (getRealData()?.external ?? []).filter((g) => !divisionOfGame(g)).filter((g) => {
    const m = externalMatch(g)
    return m.home.name === clubName || m.away.name === clubName
  })
}

/** Every match of a league club this season, in date order */
export function clubMatches(clubName: string, now: number): Match[] {
  const club = seasonClub(clubName)
  if (!club) return []
  const league = clubFixtures(club.club.id).map((f) => toMatch(f, now))
  // Its cup, Champions League and other tournaments' games
  const cup = (getRealData()?.external ?? [])
    .filter((g) => !divisionOfGame(g))
    .map(externalMatch)
    .filter((m) => m.home.name === club.club.name || m.away.name === club.club.name)
  return cup.length ? [...league, ...cup].sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime()) : league
}

/** The same for a match as the pages show it */
export function isWomenMatch(m: Match): boolean {
  return isWomenLeague(m.league, m.country) || (WOMEN_TEAM.test(m.home.name) && WOMEN_TEAM.test(m.away.name))
}

/**
 * A team's games in the tournaments we keep for the whole season (our cups,
 * the Champions League) outside its own league: HB Køge Women in the women's
 * Champions League. A women's team only in women's tournaments and the other
 * way round, so the club with the same name never gets them.
 */
export function teamTournamentMatches(names: string[], women: boolean): Match[] {
  const bare = (n: string) => normalize(n.replace(/\b(w|women|q|kvinder)\b\.?/gi, '').trim())
  const keys = new Set(names.map(bare))
  return (getRealData()?.external ?? [])
    .filter((g) => !divisionOfGame(g) && wholeSeason(g) && isWomenLeague(g.league.originalName ?? g.league.name, g.league.country) === women)
    .filter((g) => keys.has(bare(g.home.name)) || keys.has(bare(g.away.name)))
    .map(externalMatch)
}

/**
 * The games of a team outside our leagues around today: its league's (ten days
 * back, thirty ahead) and its cup and Champions League games (a women's team
 * in the women's tournaments), in date order. For its club page and "Mine hold".
 */
export function teamGames(team: { name: string; names?: string[]; sport: SportId; league: string; leagueSlug?: string }, now: number): Match[] {
  const names = team.names ?? [team.name]
  const women = isWomenLeague(team.league) || /\b(w|women)\b/i.test(team.name)
  const league = teamMatches(names, team.sport, addDays(isoDate(now), -10), 40, now, team.names ? team.leagueSlug : undefined)
  const tournaments = team.sport === 'soccer' ? teamTournamentMatches(names, women) : []
  return [...new Map([...league, ...tournaments].map((m) => [m.id, m])).values()].sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime())
}

/**
 * The other matches of a match's round (its league, three days either side), or
 * of its day when the round isn't known: links from one match page to the next.
 */
export function relatedMatches(match: Match, now: number, limit = 10): Match[] {
  if (!match.leagueSlug) return []
  const day = isoDate(match.kickoff)
  const span = match.round !== undefined ? 3 : 0
  const out: Match[] = []
  for (let i = -span; i <= span; i++) {
    for (const m of getMatches(addDays(day, i), match.sport, now)) {
      if (m.id === match.id || m.leagueSlug !== match.leagueSlug) continue
      if (match.round !== undefined && m.round !== match.round) continue
      out.push(m)
    }
  }
  return out.sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime()).slice(0, limit)
}

/** Matches for any team (any sport) over a range of days from `fromDate` */
export function teamMatches(teamName: string | string[], sport: SportId, fromDate: string, days: number, now: number, leagueSlug?: string): Match[] {
  const names = new Set(Array.isArray(teamName) ? teamName : [teamName])
  // The league under every name API-Sports lists it under (A-Liga / Kvindeliga)
  const leagues = leagueSlug ? sameLeagueKeys(leagueSlug) : undefined
  const out: Match[] = []
  for (let i = 0; i < days; i++) {
    const d = new Date(`${fromDate}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() + i)
    const date = d.toISOString().slice(0, 10)
    for (const m of getMatches(date, sport, now)) {
      // In the team's own league when given: a women's team can share its name with the men's club
      if ((names.has(m.home.name) || names.has(m.away.name)) && (!leagues || (m.leagueSlug !== undefined && leagues.includes(m.leagueSlug)))) out.push(m)
    }
  }
  return out
}

/** The next `limit` matches that have not started, within `days` days from `now` (all sources) */
export function upcomingMatches(sport: SportFilter, today: string, now: number, days = 10, limit = 8): Match[] {
  const until = now + days * 86_400_000
  return Array.from({ length: days + 1 }, (_, i) => getMatches(addDays(today, i), sport, now))
    .flat()
    .filter((m) => m.state === 'upcoming' && m.kickoff.getTime() > now && m.kickoff.getTime() <= until)
    .sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime())
    .slice(0, limit)
}

/** The nearest day after (or before) `date` with matches, looking up to 60 days away */
export function nearestMatchDay(date: string, sport: SportFilter, direction: 1 | -1, now: number): string | undefined {
  for (let i = 1; i <= 60; i++) {
    const d = addDays(date, i * direction)
    if (getMatches(d, sport, now).length) return d
  }
  return undefined
}

/** API-Sports' own record of a match (ours or theirs), for lookups such as head-to-head */
export function findExternalGame(match: Match): ExternalGame | undefined {
  const external = getRealData()?.external ?? []
  const direct = external.find((g) => g.id === match.id)
  if (direct) return direct
  const keys = new Set(namesOf(match.home.name).flatMap((h) => namesOf(match.away.name).map((a) => gameKey(match.kickoff, h, a))))
  // The same game is played the same day: only that day's games are looked at
  const sameDay = externalOn(isoDate(match.kickoff)).filter((g) => g.sport === match.sport)
  const exact = sameDay.find((g) => keys.has(gameKey(g.kickoff, g.home.name, g.away.name)))
  if (exact) return exact
  // Looser: same day and sport, and each side shares a word with one of the club's names ("HIK" / "Hellerup IK")
  const home = namesOf(match.home.name)
  const away = namesOf(match.away.name)
  const candidates = sameDay.filter((g) => alike(home, g.home.name) && alike(away, g.away.name))
  return candidates.length === 1 ? candidates[0] : undefined
}
