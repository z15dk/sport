import type { Match, SportId } from '../types'

// The matches the front page shows first ("Populære"): what most Danish visitors come for,
// out of the several hundred games a day we follow. Everything else is one press away ("Alle").
// A visitor's own starred tournaments and followed teams are added where the list is drawn
// (MatchesView). Self-contained (no imports but types), so the rules are tested as they are
// (tests/data/popular.test.ts).

type Game = Pick<Match, 'leagueId' | 'league' | 'country' | 'sport' | 'home' | 'away'>

const DENMARK = /^(denmark|danmark)$/i
/** Tournaments between countries, or between the clubs of a continent: filed under the world or Europe, never a country */
const INTERNATIONAL = /^(world|verden|europe|europa|international)$/i
const YOUTH = /\bu-?\s?\d{2}\b|youth|junior/i
/** A Danish national team, by the name we show or the source's ("Danmark", "Danmark U21", "Denmark W") */
const DANISH_TEAM = /^(danmark|denmark)(\s|$)/i

/** The international tournaments people follow, by sport */
const MAJOR: Partial<Record<SportId, RegExp>> = {
  // Also by our Danish names for them (danishLeagueName in external.ts: "VM-kvalifikation (Europa)")
  soccer: /^(uefa\b|fifa\b|world cup\b|euro championship\b|olympics?\b|vm\b|em\b)/i,
  handball: /champions league|european league|world championship|european championship|ehf euro|olympic/i,
  ice_hockey: /world championship|olympic|champions hockey league/i,
  basketball: /euroleague|eurobasket|world cup|olympic/i,
}
/** World Cup qualifying on other continents is not what a Danish visitor looks for */
const FAR_QUALIFYING = /(qualification|kvalifikation).*(africa|afrika|asia|asien|south america|sydamerika|concacaf|oceania|oceanien|intercontinental|interkontinental)/i

/** Other countries' leagues followed in Denmark, beside the ones we cover in full: sport, country (any when left out) and name */
const FOREIGN: { sport: SportId; country?: RegExp; name: RegExp }[] = [
  { sport: 'soccer', country: /^italy$/i, name: /^serie a$/i },
  { sport: 'soccer', country: /^france$/i, name: /^ligue 1$/i },
  { sport: 'soccer', country: /^netherlands$/i, name: /^eredivisie$/i },
  { sport: 'basketball', country: /^usa$/i, name: /^nba$/i },
  { sport: 'ice_hockey', country: /^usa$/i, name: /^nhl$/i },
  { sport: 'american_football', name: /^nfl$/i },
  { sport: 'handball', country: /^germany$/i, name: /^bundesliga$/i },
]
/** The same leagues by the source's id, should a league be renamed in the admin pages */
const FOREIGN_IDS = new Set(['ext-football-135', 'ext-football-61', 'ext-football-88'])

/**
 * Whether a match belongs on the front page's short list:
 * - the leagues and cups we cover in full (Danish football, Premier League, Bundesliga, La Liga, Allsvenskan, Metal Ligaen …),
 * - everything Danish in every sport, and every match of a Danish national team,
 * - the big international tournaments (Champions League, Nations League, World Cup and Euro with qualifying; not youth),
 * - a few big leagues abroad (Serie A, Ligue 1, Eredivisie, NBA, NHL, NFL, the German handball Bundesliga).
 */
export function isPopular(m: Game): boolean {
  // Ours: the leagues with a full season and the cups (the source's other leagues are "ext-…")
  if (!m.leagueId.startsWith('ext-')) return true
  const country = m.country?.trim() ?? ''
  if (DENMARK.test(country)) return true
  if (INTERNATIONAL.test(country)) {
    if (DANISH_TEAM.test(m.home.name) || DANISH_TEAM.test(m.away.name)) return true
    if (YOUTH.test(m.league) || YOUTH.test(m.home.name) || YOUTH.test(m.away.name)) return false
    // "VM" and "EM" are our Danish names for every sport's World Cup and European Championship
    return (!!MAJOR[m.sport]?.test(m.league) || /^(vm|em)(\b|-)/i.test(m.league)) && !FAR_QUALIFYING.test(m.league)
  }
  if (FOREIGN_IDS.has(m.leagueId)) return true
  return FOREIGN.some((f) => f.sport === m.sport && (!f.country || f.country.test(country)) && f.name.test(m.league.trim()))
}

/**
 * How much a match is in focus on the front page, lowest first: 0 a Danish national team, 1 the Superliga and
 * the Danish cup, 2 the other leagues we cover in full, 3 the other popular matches (the rest of Danish sport,
 * the big international tournaments, the big leagues abroad), 4 everything else. For "Kamp i fokus" and the
 * order of the live strip – the evening Denmark plays, that match comes first, not a match between two other countries.
 */
export function focusRank(m: Game): number {
  const country = m.country?.trim() ?? ''
  if (INTERNATIONAL.test(country) && (DANISH_TEAM.test(m.home.name) || DANISH_TEAM.test(m.away.name))) return 0
  if (m.leagueId === 'dk-superliga' || (m.leagueId.startsWith('cup-') && DENMARK.test(country))) return 1
  if (!m.leagueId.startsWith('ext-')) return 2
  return isPopular(m) ? 3 : 4
}
