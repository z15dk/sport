import type { SportId } from '../types'
import type { ExternalGame } from './external'
import { externalLeagueKey } from './external'
import { SEARCH_NAMES, alike, nameWords, normalize, clubNames } from './aliases'
import { seasonClubs } from './season'
import { sportOf } from './leagues'
import { countryKey } from './channels'
import { BASELINES, sameLeagueKeys } from './baselines'

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
          alike(clubNames(club), name) &&
          // Every word of the name is one of the club's ("Aarhus Fremad" is not AGF, which also goes by "Aarhus")
          nameWords(name).every((w) => clubNames(club).some((n) => nameWords(n).includes(w))),
      )
  // The same name wins ("Aarhus Fremad" is Aarhus Fremad, not also AGF, which goes by "Aarhus")
  const exact = found.filter(({ club }) => clubNames(club).some((n) => normalize(n) === normalize(name)))
  const club = exact.length === 1 ? exact[0] : found.length === 1 ? found[0] : undefined
  memo.map.set(key, club)
  return club
}

/**
 * Other tournaments we keep in full for the season (every round, result, goal
 * and card), not just the days around today: the men's and women's Champions League.
 */
const WHOLE_SEASON: { country: string; match: RegExp }[] = [{ country: 'World', match: /^UEFA Champions League( Women)?$/i }]

/** Whether a game's tournament is kept for the whole season: our cups and the tournaments above */
export function wholeSeason(g: Pick<ExternalGame, 'sport' | 'league'>): boolean {
  if (cupOfGame(g)) return true
  const name = g.league.originalName ?? g.league.name
  return g.sport === 'soccer' && WHOLE_SEASON.some((w) => w.country === g.league.country && w.match.test(name))
}

/** A women's, reserve or youth team: not the club itself, even with the club's name */
export const NOT_FIRST_TEAM = /\b(w|women|frauen|femenin\w*|feminin\w*|kvinde\w*|dame\w*|q|ii|iii|u\s?\d{2}|youth|junior|reserves?)\b|\s2$/i

/** Our club with exactly this name (ours, TheSportsDB's or API-Sports'), in any country: "Real Madrid" in the Champions League is La Liga's Real Madrid */
let exactMemo:
  | { clubs: ReturnType<typeof seasonClubs>; map: Map<string, ReturnType<typeof seasonClubs>[number] | undefined>; byName?: Map<string, ReturnType<typeof seasonClubs>> }
  | undefined
export function ourClubByName(name: string, sport: SportId) {
  const clubs = seasonClubs()
  if (exactMemo?.clubs !== clubs) exactMemo = { clubs, map: new Map() }
  const key = `${sport}|${name}`
  if (exactMemo.map.has(key)) return exactMemo.map.get(key)
  const n = normalize(name)
  // Our clubs by their normalized names, built once per season (not every club's names again for every team)
  if (!exactMemo.byName) {
    exactMemo.byName = new Map()
    for (const entry of clubs) {
      const names = new Set(clubNames(entry.club).filter((x) => x !== SEARCH_NAMES[entry.club.id]).map(normalize))
      for (const x of names) {
        const k = `${sportOf(entry.division)}|${x}`
        const list = exactMemo.byName.get(k)
        if (list) list.push(entry)
        else exactMemo.byName.set(k, [entry])
      }
    }
  }
  let found = n ? (exactMemo.byName.get(`${sport}|${n}`) ?? []) : []
  // The source's short name for one of our clubs in the other sports ("Gladsaxe" is Gladsaxe Basketball, "Horsens" Horsens IC):
  // the name is the start of exactly one club's name. Not football, where a town has several clubs ("Aarhus" is AGF, not Aarhus Fremad)
  if (!found.length && sport !== 'soccer' && n.length >= 4) {
    const starts = new Set<(typeof found)[number]>()
    for (const [k, list] of exactMemo.byName) if (k.startsWith(`${sport}|${n} `)) for (const e of list) starts.add(e)
    found = [...starts]
  }
  const club = found.length === 1 ? found[0] : undefined
  exactMemo.map.set(key, club)
  return club
}

/** Our club a team in a cup or a whole-season tournament stands for */
export function ourClubIn(g: Pick<ExternalGame, 'sport' | 'league'>, name: string) {
  const cup = cupOfGame(g)
  return (cup && ourClubInCup(name, cup)) || (wholeSeason(g) ? ourClubByName(name, g.sport) : undefined)
}

/** Our club a team in any other tournament stands for: as above, else by its exact name, unless it is a women's or youth team or league */
export function ourClubInGame(g: Pick<ExternalGame, 'sport' | 'league'>, name: string) {
  const found = ourClubIn(g, name)
  if (found) return found
  if (NOT_FIRST_TEAM.test(`${g.league.name} ${name}`) || sameLeagueKeys(externalLeagueKey(g.league)).some((k) => BASELINES[k])) return undefined
  return ourClubByName(name, g.sport)
}
