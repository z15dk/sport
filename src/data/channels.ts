import type { Match, SportId } from '../types'
import { danishLeagueName, gameKey } from './external'
import { getRealData } from './real'
import type { Partner } from './partners'

// Which channel shows a match. Set up in the admin pages (/admin/kanaler):
//   1. an exception for one match (a channel, or "none"),
//   2. TheSportsDB's Danish TV listings, when the key gives access to them,
//   3. rules: sport / country / league -> channel (the most specific wins).
// Matches none of these cover show no channel.

export interface ChannelDef {
  id: string
  name: string
  /** Where the logo links to */
  url?: string
  /** Logo from TheSportsDB's TV listings (uploads and local files win) */
  logo?: string
}

export interface ChannelRule {
  id: string
  channelId: string
  sport?: SportId
  /** English country name, e.g. "Denmark" */
  country?: string
  /** League name as shown on the site (case does not matter) */
  league?: string
}

export interface ChannelData {
  channels: ChannelDef[]
  rules: ChannelRule[]
  /** Match id -> channel id, or "none" for no channel */
  overrides: Record<string, string>
  /** Channel ids from the TV listings, by match id ("tsdb-<id>") and by "date|home|away" */
  tv: Record<string, string[]>
}

/** Our Danish country names -> the English ones the data sources use */
const COUNTRY: Record<string, string> = {
  Danmark: 'Denmark',
  Tyskland: 'Germany',
  England: 'England',
  Sverige: 'Sweden',
  Norge: 'Norway',
  Spanien: 'Spain',
  Europa: 'Europe',
  Verden: 'World',
}
export const countryKey = (country?: string) => (country ? (COUNTRY[country] ?? country).toLowerCase() : '')

/** How specific a rule is: a league beats a country, which beats a sport */
const specificity = (r: ChannelRule) => (r.league ? 4 : 0) + (r.country ? 2 : 0) + (r.sport ? 1 : 0)

export function ruleMatches(r: ChannelRule, match: Pick<Match, 'sport' | 'country' | 'league'>) {
  return (
    (!r.sport || r.sport === match.sport) &&
    (!r.country || countryKey(r.country) === countryKey(match.country)) &&
    // A rule written with the source's name for the league still holds when we show the league by its Danish name
    (!r.league || [r.league, danishLeagueName(r.league, r.country) ?? r.league].some((n) => n.trim().toLowerCase() === match.league.trim().toLowerCase()))
  )
}

/** The rule that decides for a match or a league: the most specific one that fits */
export const ruleFor = (rules: ChannelRule[], match: Pick<Match, 'sport' | 'country' | 'league'>): ChannelRule | undefined =>
  rules.filter((r) => ruleMatches(r, match)).sort((a, b) => specificity(b) - specificity(a))[0]

type Source = 'undtagelse' | 'tv-program' | 'regel'

/** The channels showing a match and where that comes from (for the admin pages) */
export function channelInfo(match: Match, data = getRealData()?.channels): { channels: Partner[]; source?: Source } {
  if (!data) return { channels: [] }
  const byId = new Map(data.channels.map((c) => [c.id, c]))
  const partners = (ids: string[]) => ids.map((id) => byId.get(id)).filter((c): c is ChannelDef => !!c).map((c) => ({ id: c.id, name: c.name, url: c.url }))
  const override = data.overrides[match.id]
  if (override) return override === 'none' ? { channels: [], source: 'undtagelse' } : { channels: partners([override]), source: 'undtagelse' }
  const tv = data.tv[match.id] ?? data.tv[gameKey(match.kickoff, match.home.name, match.away.name)]
  if (tv?.length) return { channels: partners(tv), source: 'tv-program' }
  const rule = ruleFor(data.rules, match)
  return rule ? { channels: partners([rule.channelId]), source: 'regel' } : { channels: [] }
}

/** The channels showing a match, or none */
export const channelsFor = (match: Match): Partner[] => channelInfo(match).channels
