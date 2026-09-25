import type { SportId } from '../types'

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

const TV: Partner = { id: 'tv-kanal', name: 'TV-kanal' }
const STREAM: Partner = { id: 'streaming', name: 'Streaming' }
/** Streams every Danish ice hockey match and the Danish 2nd and 3rd divisions (logo: public/logos/kanaler/direkte-sport.jpg) */
const DIREKTE_SPORT: Partner = { id: 'direkte-sport', name: 'Direkte Sport' }

/** Shows every Danish basketball match */
const EKSTRA_BLADET: Partner = { id: 'ekstra-bladet', name: 'Ekstra Bladet' }

/** Every channel, for the admin pages (logos can be uploaded there) */
export const CHANNELS: Partner[] = [DIREKTE_SPORT, EKSTRA_BLADET, TV, STREAM]

const isDanish = (country?: string) => country === 'Danmark' || country === 'Denmark'

/** Channel per league (by league slug), falling back to one per sport */
const CHANNELS_BY_LEAGUE: Record<string, Partner[]> = {
  superliga: [TV, STREAM],
  metalligaen: [DIREKTE_SPORT],
}
const CHANNELS_BY_SPORT: Record<SportId, Partner[]> = {
  soccer: [STREAM],
  ice_hockey: [STREAM],
  basketball: [STREAM],
  handball: [TV],
  tennis: [STREAM],
  volleyball: [STREAM],
  american_football: [TV],
}

/** Channels showing a match; the pick is stable per match so it does not change between visits */
export function channelsFor(leagueSlug: string | undefined, sport: SportId, matchId: string, country?: string, league?: string): Partner[] {
  // All Danish ice hockey and the Danish 2nd and 3rd divisions, also games from API-Sports outside our league pages
  if (sport === 'ice_hockey' && isDanish(country)) return [DIREKTE_SPORT]
  if (sport === 'soccer' && isDanish(country) && /^[23]\.\s*div/i.test(league ?? '')) return [DIREKTE_SPORT]
  if (sport === 'basketball' && isDanish(country)) return [EKSTRA_BLADET]
  const options = (leagueSlug && CHANNELS_BY_LEAGUE[leagueSlug]) || CHANNELS_BY_SPORT[sport]
  if (options.length <= 1) return options
  let h = 0
  for (const ch of matchId) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return [options[h % options.length]]
}
