import 'server-only'
import type { SportId } from '../types'
import type { TableRow } from '../data/matchExtra'
import { readArchive, type ArchivedMatch } from './archive'

// Checks an earlier season of one of our leagues against the league's official
// final table (API-Sports' /standings): every team must have the same number of
// matches, wins, draws, losses and goals in our saved matches as in the table.
// Only a season that passes gets a page. Differences in points alone are
// deducted points (the official table's points are shown).

/** Rounds that are not part of the league table: play-offs, qualifiers, finals */
export const NOT_LEAGUE_ROUND = /play-?offs?|qualif|final|semi|quarter|knock|europe|conference|pre-?season|friendl/i

const API_SPORTS_ID = /^(football|hockey|basketball|nba|handball|volleyball|nfl)-\d+$/

export interface OfficialRow {
  rank: number
  name: string
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor?: number
  goalsAgainst?: number
  points?: number
}

export interface SeasonCheck {
  status: 'ok' | 'missing' | 'mismatch' | 'no-official' | 'no-games'
  /** In Danish, for the admin page */
  issues: string[]
  /** Our saved league matches of the season (API-Sports' ids, play-offs left out) */
  games: ArchivedMatch[]
  /** The final table as the league ranked it (the official one) */
  table: OfficialRow[]
  /** Teams whose official points differ from their results: deducted (negative) or added points */
  adjustments: { name: string; points: number }[]
  /** How many teams played in the championship group of a split season (ranked first) */
  upper?: number
}

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')

/** A season's saved league matches: API-Sports' ids, this league and season, no play-off rounds */
export function leagueSeasonGames(divisionId: string, season: string): ArchivedMatch[] {
  return readArchive().filter((a) => a.divisionId === divisionId && a.season === season && API_SPORTS_ID.test(a.id) && !NOT_LEAGUE_ROUND.test(a.round ?? ''))
}

/**
 * The final table from the official groups. A league that splits (Superliga,
 * 1. division, Allsvenskan's old format…) has the regular season and the
 * championship and relegation groups: each team's final row is the one from
 * its last group, with the regular season added when the group's numbers
 * don't carry it over.
 */
export function finalTable(groups: TableRow[][]): { table: OfficialRow[]; upper?: number } {
  const named = groups.filter((g) => g.length > 1 && !NOT_LEAGUE_ROUND.test(g[0]?.group ?? ''))
  if (!named.length) return { table: [] }
  const toRow = (r: TableRow): OfficialRow => ({
    rank: r.rank,
    name: r.name,
    played: r.played,
    won: r.won,
    drawn: r.drawn ?? 0,
    lost: r.lost,
    goalsFor: r.for,
    goalsAgainst: r.against,
    points: r.points,
  })
  const size = Math.max(...named.map((g) => g.length))
  const whole = named.find((g) => g.length === size)!
  const parts = named.filter((g) => g !== whole && g.every((r) => whole.some((w) => norm(w.name) === norm(r.name))))
  const covered = new Set(parts.flatMap((g) => g.map((r) => norm(r.name))))
  // No split (or the parts don't cover every team): the whole table is the final one
  if (!parts.length || covered.size !== whole.length) return { table: whole.map(toRow).sort((a, b) => a.rank - b.rank) }
  // The championship group first: its name says so, or else it holds the regular season's leader
  const leader = norm([...whole].sort((a, b) => a.rank - b.rank)[0].name)
  const isUpper = (g: TableRow[]) => /champion|title|meister|mester|upper|top|promotion/i.test(g[0]?.group ?? '') || g.some((r) => norm(r.name) === leader)
  const ordered = [...parts].sort((a, b) => Number(isUpper(b)) - Number(isUpper(a)))
  const regular = new Map(whole.map((r) => [norm(r.name), r]))
  const table: OfficialRow[] = []
  for (const g of ordered) {
    for (const r of [...g].sort((a, b) => a.rank - b.rank)) {
      const base = regular.get(norm(r.name))!
      // The group's own matches only: add the regular season
      const add = r.played < base.played
      table.push({
        rank: table.length + 1,
        name: r.name,
        played: r.played + (add ? base.played : 0),
        won: r.won + (add ? base.won : 0),
        drawn: (r.drawn ?? 0) + (add ? (base.drawn ?? 0) : 0),
        lost: r.lost + (add ? base.lost : 0),
        goalsFor: r.for === undefined ? undefined : r.for + (add ? (base.for ?? 0) : 0),
        goalsAgainst: r.against === undefined ? undefined : r.against + (add ? (base.against ?? 0) : 0),
        // Points carry over in a split; a group that starts from zero has fewer than the regular season
        points: r.points === undefined ? undefined : (r.points ?? 0) < (base.points ?? 0) ? (r.points ?? 0) + (base.points ?? 0) : r.points,
      })
    }
  }
  return { table, upper: ordered[0].length }
}

export function checkSeason(divisionId: string, season: string, sport: SportId, groups?: TableRow[][]): SeasonCheck {
  const games = leagueSeasonGames(divisionId, season)
  const empty = { games, table: [], adjustments: [] }
  if (!games.length) return { status: 'no-games', issues: ['Ingen kampe gemt'], ...empty }
  if (!groups?.length) return { status: 'no-official', issues: ['Den officielle slutstilling er ikke hentet endnu'], ...empty }
  const { table, upper } = finalTable(groups)
  if (!table.length) return { status: 'no-official', issues: ['Kilden har ingen slutstilling for sæsonen'], ...empty }

  // Our numbers per team from the saved matches
  const ours = new Map<string, { played: number; won: number; drawn: number; lost: number; gf: number; ga: number }>()
  const add = (name: string, f: number, a: number) => {
    const r = ours.get(norm(name)) ?? ours.set(norm(name), { played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0 }).get(norm(name))!
    r.played++
    r.gf += f
    r.ga += a
    if (f > a) r.won++
    else if (f < a) r.lost++
    else r.drawn++
  }
  const seen = new Set<string>()
  const issues: string[] = []
  for (const g of games) {
    const key = `${norm(g.homeName)}|${norm(g.awayName)}|${g.date.toISOString().slice(0, 10)}`
    if (seen.has(key)) issues.push(`Dublet: ${g.homeName} – ${g.awayName} ${g.date.toISOString().slice(0, 10)}`)
    seen.add(key)
    add(g.homeName, g.homeScore, g.awayScore)
    add(g.awayName, g.awayScore, g.homeScore)
  }
  // Hockey and basketball: overtime and shootouts are counted differently between sources, so only the number of matches counts
  const goalsCount = sport === 'soccer'
  let missing = 0
  const adjustments: SeasonCheck['adjustments'] = []
  for (const row of table) {
    const r = ours.get(norm(row.name))
    if (!r) {
      issues.push(`${row.name}: ingen kampe gemt (officielt ${row.played})`)
      missing += row.played
      continue
    }
    if (r.played < row.played) {
      issues.push(`${row.name}: ${r.played} kampe gemt, officielt ${row.played}`)
      missing += row.played - r.played
    } else if (r.played > row.played) issues.push(`${row.name}: ${r.played} kampe gemt, officielt kun ${row.played}`)
    else if (goalsCount && (r.won !== row.won || r.drawn !== row.drawn || r.lost !== row.lost))
      issues.push(`${row.name}: ${r.won}-${r.drawn}-${r.lost} i vores kampe, officielt ${row.won}-${row.drawn}-${row.lost}`)
    else if (goalsCount && row.goalsFor !== undefined && (r.gf !== row.goalsFor || r.ga !== row.goalsAgainst))
      issues.push(`${row.name}: målscore ${r.gf}-${r.ga} i vores kampe, officielt ${row.goalsFor}-${row.goalsAgainst}`)
    else if (goalsCount && row.points !== undefined) {
      const diff = row.points - (r.won * 3 + r.drawn)
      if (diff) adjustments.push({ name: row.name, points: diff })
    }
  }
  // Teams in our matches the table doesn't have (a wrong league's games)
  const official = new Set(table.map((r) => norm(r.name)))
  for (const [key, r] of ours) if (!official.has(key)) issues.push(`Hold uden for slutstillingen: ${games.find((g) => norm(g.homeName) === key || norm(g.awayName) === key)?.homeName ?? key} (${r.played} kampe)`)
  const status = !issues.length ? 'ok' : missing > 0 && issues.every((i) => /gemt, officielt \d|ingen kampe gemt/.test(i)) ? 'missing' : 'mismatch'
  return { status, issues, games, table, adjustments, upper }
}
