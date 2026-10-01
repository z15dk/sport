// Advertising placements. Every placement reserves its space up front, so the
// page does not jump when an ad loads. Until a placement gets a creative (or an
// ad network fills the element with id `ad-<placement>`), a labelled
// placeholder shows where the ad will go. Hide the placeholders with
// NEXT_PUBLIC_AD_PLACEHOLDERS=false.
//
// A creative is an image in public/ads/ plus a link, e.g.
//   creative: { src: '/ads/top.jpg', href: 'https://annoncør.dk', alt: 'Annoncør' }
// Mark gambling ads with `gambling: true` so the responsible-gambling line is shown.

export type AdPlacementId = 'top' | 'feed' | 'side' | 'content'

export interface AdSize {
  width: number
  height: number
}

export interface AdCreative {
  src: string
  href: string
  alt: string
  gambling?: boolean
}

export interface AdPlacement {
  id: AdPlacementId
  /** Shown in the placeholder so the sales team knows what is being sold */
  name: string
  desktop: AdSize
  mobile: AdSize
  creative?: AdCreative
}

/**
 * A placement as set in /admin/reklamer (src/lib/adsConfig.ts, ads.json): its own
 * banner (uploaded pictures for computer and phone, a link) or an ad network's code,
 * or off. Without one the placement uses its `creative` below, else a placeholder.
 */
export interface AdSlotConfig {
  mode: 'off' | 'image' | 'code'
  /** Uploaded banner (/uploads/<hash>.webp) for computers, and for phones (else the computer's) */
  desktop?: string
  mobile?: string
  href?: string
  alt?: string
  /** A gambling ad: the responsible-gambling line is shown under it */
  gambling?: boolean
  /** An ad network's HTML/script for the placement (run in the browser) */
  code?: string
}

export interface AdsConfig {
  slots: Partial<Record<AdPlacementId, AdSlotConfig>>
  /** Code loaded once on every page (e.g. an ad network's main script) */
  head?: string
  /** Served as /ads.txt (the ad networks' list of authorised sellers) */
  adsTxt?: string
}

export const AD_PLACEMENT_IDS: AdPlacementId[] = ['top', 'feed', 'side', 'content']

export const AD_PLACEMENTS: Record<AdPlacementId, AdPlacement> = {
  // Under the header on every page
  top: { id: 'top', name: 'Topbanner', desktop: { width: 970, height: 90 }, mobile: { width: 320, height: 100 } },
  // Between the leagues on the front page and in the content on other pages
  feed: { id: 'feed', name: 'Kampliste', desktop: { width: 728, height: 90 }, mobile: { width: 320, height: 100 } },
  // Right-hand column on the front page, sticky with the column
  side: { id: 'side', name: 'Sidebanner', desktop: { width: 300, height: 600 }, mobile: { width: 300, height: 250 } },
  // Inside match, club and league pages
  content: { id: 'content', name: 'Artikelbanner', desktop: { width: 300, height: 250 }, mobile: { width: 300, height: 250 } },
}

/** On the front page: an ad after this many league sections, then again every FEED_AD_EVERY */
export const FEED_AD_FIRST = 3
export const FEED_AD_EVERY = 6

export const SHOW_AD_PLACEHOLDERS = process.env.NEXT_PUBLIC_AD_PLACEHOLDERS !== 'false'
