import type { SportId } from '../types'
import type { ExternalGame } from './external'
import { externalLeagueKey } from './external'
import { SEARCH_NAMES, alike } from './aliases'
import { seasonClubs } from './season'
import { sportOf } from './leagues'
import { countryKey } from './channels'

// Cups we follow in full from API-Sports: the whole season's games are kept
// (not just the days around today), the cup gets a page with its rounds, and
// our clubs' cup games show on their club pages under our clubs' names.

export interface Cup {
  /** Shown until a name is set in the admin pages */
  name: string
  sport: SportId
  country: string
  /** The sources' names for it (sponsors change, so a pattern) */
  match: RegExp
  /** Its name in our addresses, the same whatever the sponsor: /turnering/x-<country>-<key> */
  key: string
}

export const CUPS: Cup[] = [{ name: 'Betano Pokalen', sport: 'soccer', country: 'Denmark', match: /pokal|dbu cup|danish cup|landspokal/i, key: 'Pokalen' }]

const NOT_SENIOR = /women|kvinde|dame|u\s?\d{2}|youth|junior|futsal/i

/** The cup an API-Sports game is played in, if it is one we follow */
export function cupOfGame(g: Pick<ExternalGame, 'sport' | 'league'>): Cup | undefined {
  const name = g.league.originalName ?? g.league.name
  if (NOT_SENIOR.test(name)) return undefined
  return CUPS.find((c) => c.sport === g.sport && countryKey(c.country) === countryKey(g.league.country) && c.match.test(name))
}

/** A cup game under the cup's own key, so every source and sponsor name lands on the same page */
export function asCupGame(g: ExternalGame): ExternalGame {
  const cup = cupOfGame(g)
  return cup && g.league.originalName !== cup.key ? { ...g, league: { ...g.league, originalName: cup.key } } : g
}

/** Whether a league key (/turnering/<key>) is one of our cups, from the games we have */
export const isCupGame = (g: ExternalGame, key: string) => !!cupOfGame(g) && externalLeagueKey(g.league) === key

/** Reserve and youth teams are not the club itself ("FC Midtjylland II") */
const RESERVE = /\b(ii|iii|u\s?\d{2})\b|\s2$/i

/** Our club an API-Sports team name stands for in a cup, when exactly one of ours in that country and sport fits */
let memo: { clubs: ReturnType<typeof seasonClubs>; map: Map<string, ReturnType<typeof seasonClubs>[number] | undefined> } | undefined
export function ourClubInCup(name: string, cup: Cup) {
  const clubs = seasonClubs()
  if (memo?.clubs !== clubs) memo = { clubs, map: new Map() }
  const key = `${cup.country}|${name}`
  if (memo.map.has(key)) return memo.map.get(key)
  const found = RESERVE.test(name)
    ? []
    : clubs.filter(
        ({ club, division }) =>
          sportOf(division) === cup.sport &&
          countryKey(division.country) === countryKey(cup.country) &&
          alike([club.name, club.originalName, club.apiName, SEARCH_NAMES[club.id]].filter((n): n is string => !!n), name),
      )
  const club = found.length === 1 ? found[0] : undefined
  memo.map.set(key, club)
  return club
}
