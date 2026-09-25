import type { SportId } from '../types'
import { getRealData } from './real'

// Betting and TV partners. These are placeholders: replace names and links
// with the real partners, and put their logos in
//   public/logos/bookmakere/<id>.svg|png|webp|jpg
//   public/logos/kanaler/<id>.svg|png|webp|jpg
// Without a logo file the name is shown instead.

export interface Partner {
  id: string
  name: string
  /** Where "Til bookmaker" / the channel logo links to; no link when empty */
  url?: string
}

/** The bookmaker whose odds are shown with every upcoming match */
export const BOOKMAKER: Partner = { id: 'odds-partner', name: 'Odds-partner' }

/** Required with any gambling marketing in Denmark */
export const RESPONSIBLE_GAMBLING = { text: '18+ · Spil ansvarligt · Hjælp: StopSpillet.dk', url: 'https://stopspillet.dk' }

/** Streams every Danish ice hockey match and the Danish 2nd and 3rd divisions (logo: public/logos/kanaler/direkte-sport.jpg) */
const DIREKTE_SPORT: Partner = { id: 'direkte-sport', name: 'Direkte Sport' }

/** Shows every Danish basketball match */
const EKSTRA_BLADET: Partner = { id: 'ekstra-bladet', name: 'Ekstra Bladet' }

/** Every channel, for the admin pages (logos and links are set there) */
export const CHANNELS: Partner[] = [DIREKTE_SPORT, EKSTRA_BLADET]

const isDanish = (country?: string) => country === 'Danmark' || country === 'Denmark'

/** The link set in the admin pages, when there is one */
const withLink = (p: Partner): Partner => {
  const url = getRealData()?.channelLinks?.[p.id]
  return url ? { ...p, url } : p
}

/** The channel showing a match, or none */
export function channelsFor(_leagueSlug: string | undefined, sport: SportId, _matchId: string, country?: string, league?: string): Partner[] {
  // Only matches a channel is set for show one; all others show nothing
  if (sport === 'ice_hockey' && isDanish(country)) return [withLink(DIREKTE_SPORT)]
  if (sport === 'soccer' && isDanish(country) && /^[23]\.\s*div/i.test(league ?? '')) return [withLink(DIREKTE_SPORT)]
  if (sport === 'basketball' && isDanish(country)) return [withLink(EKSTRA_BLADET)]
  return []
}
