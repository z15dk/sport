import type { Incident, Match, MatchState, PeriodScore, SportId } from '../types'
import { matchSlug, slugify } from '../lib/slug'
import { isoDate } from '../lib/time'
import { normalize } from './aliases'
import { shownTeam } from './countries'

// Games from API-Sports (football, basketball, NBA, ice hockey, handball,
// volleyball, NFL). The server job (src/lib/apisports.ts) fetches them day by
// day and hands them to the browser with the rest of the real data.

export interface ExternalGame {
  /** "<api>-<id>", e.g. "football-1035037" */
  id: string
  sport: SportId
  league: { id: string; name: string; country?: string; logo?: string; season?: string; /** Before a rename in the admin pages */ originalName?: string }
  home: { name: string; logo?: string; id?: number }
  away: { name: string; logo?: string; id?: number }
  /** ISO timestamp */
  kickoff: string
  state: MatchState
  /** Minute or period while live, e.g. "67'", "Q3", "Pause" */
  label?: string
  homeScore?: number
  awayScore?: number
  venue?: string
  /** Stadium name, when the city is in venue */
  stadium?: string
  round?: string
  referee?: string
  /** Half-time score */
  ht?: [number, number]
  /** Goals and cards, when the source has them */
  incidents?: Incident[]
  /** The score of each set, period, half or quarter (volleyball, ice hockey, handball, basketball) */
  periods?: PeriodScore[]
  /** What the goals and cards were fetched for ("state|score"), so they are fetched again when it changes */
  eventsFor?: string
}

/** A women's tournament by its name: Kvindeliga, A-Liga, "Women", Frauen, Damallsvenskan, WSL, Liga F … */
export const WOMEN_LEAGUE = /women|kvinde|frauen|femin|femmin|damallsvenskan|toppserien|a-liga|\bwsl\b|\bnwsl\b|\bwnba\b|\bsdhl\b|\bpwhl\b|\bliga f\b|première ligue|arkema|damer|\bdame\b|dameliga|damehånd|damehand|\bladies\b/i
/** A women's team by its name: "Brondby W", "HB Køge Women" */
export const WOMEN_TEAM = /(\b(w|women|kvinder|damer|dames|frauen|femenino|feminino|féminines)\b\.?|\(k\))$/i

/** A women's game (every sport): the tournament's name, or both teams named as women's teams */
export function isWomenGame(g: ExternalGame): boolean {
  return isWomenLeague(g.league.originalName ?? g.league.name, g.league.country) || (WOMEN_TEAM.test(g.home.name) && WOMEN_TEAM.test(g.away.name))
}

/** Denmark's women's leagues are the A-, B- and C-Liga (the names say nothing of women); elsewhere a "B-Liga" is a men's league */
const DANISH_WOMEN = /^([abc]-liga(en)?|kvindeserien|3F Kvindeserie)\b/i
export const isWomenLeague = (name: string, country?: string) => WOMEN_LEAGUE.test(name) || (/^denmark$|^danmark$/i.test(country ?? '') && DANISH_WOMEN.test(name))

/**
 * A round's name in Danish: "3rd Round" and "Round 3" -> "3. runde",
 * "Regular Season - 9" -> "9. runde", "Round of 16" and "1/8-finals" ->
 * "Ottendedelsfinale", "Quarter-finals" -> "Kvartfinale" and so on.
 */
export function danishRound(round?: string | number): string | undefined {
  if (round === undefined || round === null || round === '') return undefined
  const r = String(round).trim()
  if (/^\d+$/.test(r)) return `${r}. runde`
  const stage = /^(.*?)\s*-\s*(\d+)$/.exec(r)
  const stages: Record<string, string> = { 'regular season': '', 'league stage': 'Ligafase, ', 'group stage': 'Gruppespil, ', qualifying: 'Kvalifikation, ' }
  if (stage && stage[1].toLowerCase() in stages) return `${stages[stage[1].toLowerCase()]}${stage[2]}. runde`
  const lower = r.toLowerCase()
  // The qualifying rounds before the tournament proper: "1st Qualifying Round", "2nd Qualifying Round - Semi-finals", "Qualifying Round 2"
  if (/qualif/.test(lower)) {
    const nr = /(\d+)(?:st|nd|rd|th)?\b/.exec(lower)?.[1]
    const part = /semi/.test(lower) ? ', semifinale' : /final/.test(lower) ? ', finale' : /play-?off/.test(lower) ? ', playoff' : ''
    return nr ? `Kvalifikation, ${nr}. runde${part}` : `Kvalifikation${part}`
  }
  const finals: [RegExp, string][] = [
    [/semi/, 'Semifinale'],
    [/quarter|1\/4|round of 8\b/, 'Kvartfinale'],
    [/1\/8|8th final|round of 16/, 'Ottendedelsfinale'],
    [/1\/16|16th final|round of 32/, '1/16-finale'],
    [/1\/32|round of 64/, '1/32-finale'],
    [/3rd place|third place|bronze/, 'Bronzekamp'],
  ]
  for (const [re, name] of finals) if (re.test(lower)) return name
  if (/^finals?$/.test(lower)) return 'Finale'
  if (/preliminary/.test(lower)) return 'Indledende runde'
  const n = /(\d+)(?:st|nd|rd|th)?\s*round|round\s*(\d+)/.exec(lower)
  if (/^play-?offs?$/.test(lower)) return 'Playoff'
  if (n) return `${n[1] ?? n[2]}. runde`
  return r
}

/**
 * The key an API-Sports league (not one of ours) goes by: its page
 * (/turnering/<key>), its logo and its name in the admin pages. From the
 * original name, so a rename keeps the key.
 */
export { danishLeagueName } from './danishLeagues'

export const externalLeagueKey = (league: { name: string; country?: string; originalName?: string }) =>
  `x-${slugify(`${league.country ?? ''} ${league.originalName ?? league.name}`)}`

/** Same date and the same two teams (by normalised name) */
export const gameKey = (kickoff: string | Date, home: string, away: string) =>
  `${isoDate(typeof kickoff === 'string' ? new Date(kickoff) : kickoff)}|${normalize(home)}|${normalize(away)}`

export function externalToMatch(g: ExternalGame): Match {
  const kickoff = new Date(g.kickoff)
  const hasScore = g.state !== 'upcoming' && g.homeScore !== undefined && g.awayScore !== undefined
  return {
    id: g.id,
    slug: matchSlug(g.home.name, g.away.name, isoDate(kickoff)),
    sport: g.sport,
    league: g.league.name,
    leagueId: `ext-${g.id.split('-')[0]}-${g.league.id}`,
    leagueOrder: 50,
    country: g.league.country,
    leagueBadge: g.league.logo,
    leagueSlug: externalLeagueKey(g.league),
    kickoff,
    state: g.state,
    statusLabel: g.state === 'finished' ? 'Slut' : g.state === 'postponed' ? 'Udsat' : g.label,
    venue: g.venue,
    real: true,
    ...(g.incidents?.length && { incidents: g.incidents }),
    ...(g.periods?.length && { periods: g.periods }),
    winner:
      g.state !== 'finished' || !hasScore
        ? undefined
        : g.homeScore! > g.awayScore!
          ? 'home'
          : g.homeScore! < g.awayScore!
            ? 'away'
            : 'draw',
    // The names as we show them (national teams in Danish, women's teams marked "(K)"); the address keeps the source's
    home: { name: shownTeam(g.home.name, g.league.country), badge: g.home.logo, score: hasScore ? g.homeScore : undefined },
    away: { name: shownTeam(g.away.name, g.league.country), badge: g.away.logo, score: hasScore ? g.awayScore : undefined },
  }
}
