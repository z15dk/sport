import 'server-only'
import { externalLeague, type ExternalLeague } from './apisports'
import { loadRealData } from './realdata'
import { BASELINES } from '../data/baselines'
import { getRealData } from '../data/real'
import { externalLeagueKey } from '../data/external'
import { cupOfGame } from '../data/cups'

/** A league we know from API-Sports' games, or from a starting table entered before any of its games came */
export function knownLeague(slug: string): (ExternalLeague & { title?: string }) | undefined {
  const b = BASELINES[slug]
  // A cup: under its own key from the games (API-Sports and our match database)
  const g = (loadRealData() ?? getRealData())?.external?.find((x) => cupOfGame(x) && externalLeagueKey(x.league) === slug)
  if (g) return { key: slug, api: g.id.split('-')[0], id: g.league.id, name: g.league.originalName ?? g.league.name, title: g.league.name, country: g.league.country, sport: g.sport, logo: g.league.logo, lastSeen: 0 }
  return externalLeague(slug) ?? (b && { key: slug, api: 'football', id: '', name: b.league.name, country: b.league.country, sport: b.league.sport, lastSeen: 0 })
}
