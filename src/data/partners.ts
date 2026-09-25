
// The betting partner (a placeholder: replace name and link with the real
// partner, and put its logo in public/logos/bookmakere/<id>.svg|png|webp|jpg).
// TV channels are set up in the admin pages; see src/data/channels.ts.

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
