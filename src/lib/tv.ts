import 'server-only'
import type { Match, SportId } from '../types'
import { getMatches } from '../data/matches'
import { channelsFor } from '../data/channels'
import { shownDivisions, sportOf } from '../data/leagues'
import { getRealData } from '../data/real'
import { cupOfGame, wholeSeason } from '../data/cups'
import { externalLeagueKey } from '../data/external'
import { addDays, isoDate } from './time'

// The TV guide (/tv and /tv/<league>): the coming matches that have a channel,
// from the same choice as everywhere else on the site (channelsFor: an
// exception for the match, the Danish TV listings, then the rules set up in
// /admin/kanaler). A match without a known channel is not on these pages.

export interface TvLeague {
  slug: string
  name: string
  sport: SportId
  country?: string
}

/** The leagues with a TV page: ours, the cup and the tournaments kept in full (Champions League) */
export function tvLeagues(): TvLeague[] {
  const ours: TvLeague[] = shownDivisions().map((d) => ({ slug: d.slug, name: d.name, sport: sportOf(d), country: d.country }))
  const more = new Map<string, TvLeague>()
  for (const g of getRealData()?.external ?? []) {
    if (!cupOfGame(g) && !wholeSeason(g)) continue
    const slug = externalLeagueKey(g.league)
    if (!more.has(slug)) more.set(slug, { slug, name: g.league.name, sport: g.sport, country: g.league.country })
  }
  return [...ours, ...more.values()]
}

/** The matches from today on (live and coming) that are shown on TV, in time order */
export function tvMatches(days: number, now: number, leagueSlug?: string, sport: SportId | 'all' = 'all'): Match[] {
  const today = isoDate(now)
  const out: Match[] = []
  for (let i = 0; i < days; i++) {
    for (const m of getMatches(addDays(today, i), sport, now)) {
      if (m.state === 'finished' || m.state === 'postponed') continue
      if (leagueSlug && m.leagueSlug !== leagueSlug) continue
      if (channelsFor(m).length) out.push(m)
    }
  }
  return out.sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime())
}

/** Matches grouped by tournament, in the order they first come */
export function byLeague(matches: Match[]): { league: string; slug?: string; matches: Match[] }[] {
  const groups: { league: string; slug?: string; matches: Match[] }[] = []
  for (const m of matches) {
    const g = groups.find((x) => x.league === m.league)
    if (g) g.matches.push(m)
    else groups.push({ league: m.league, slug: m.leagueSlug, matches: [m] })
  }
  return groups
}
