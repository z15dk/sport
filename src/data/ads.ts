// Advertising placements. Every placement reserves its space up front, so the
// page does not jump when an ad loads. Until a placement gets a creative (or an
// ad network fills the element with id `ad-<placement>`), a labelled
// placeholder shows where the ad will go. Hide the placeholders with
// NEXT_PUBLIC_AD_PLACEHOLDERS=true (off by default: an empty placement is not shown at all).
//
// A creative is an image in public/ads/ plus a link, e.g.
//   creative: { src: '/ads/top.jpg', href: 'https://annoncør.dk', alt: 'Annoncør' }
// Mark gambling ads with `gambling: true` so the responsible-gambling line is shown.

export type AdPlacementId = 'top' | 'feed' | 'side' | 'content' | 'scroll'

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
  /** The widest screen that gets the phone size (default 700 px) */
  mobileBelow?: number
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
  /** More banners shown in turn with the first (the full-screen ad: up to MAX_CREATIVES in all) */
  more?: AdBanner[]
}

/** One banner of a placement that shows several in turn */
export interface AdBanner {
  desktop?: string
  mobile?: string
  href?: string
  alt?: string
  gambling?: boolean
}

/** Banners a placement can show in turn (the full-screen ad) */
export const MAX_CREATIVES = 4

/** A placement's banners with a picture, in order: the first is the slot's own */
export function creativesOf(slot: AdSlotConfig | undefined): AdBanner[] {
  if (!slot) return []
  return [slot, ...(slot.more ?? [])].filter((c) => !!c.desktop)
}

export interface AdsConfig {
  slots: Partial<Record<AdPlacementId, AdSlotConfig>>
  /** Code loaded once on every page (e.g. an ad network's main script) */
  head?: string
  /** Served as /ads.txt (the ad networks' list of authorised sellers) */
  adsTxt?: string
}

export const AD_PLACEMENT_IDS: AdPlacementId[] = ['top', 'feed', 'side', 'content', 'scroll']

export const AD_PLACEMENTS: Record<AdPlacementId, AdPlacement> = {
  // Under the header on every page
  top: { id: 'top', name: 'Topbanner', desktop: { width: 970, height: 90 }, mobile: { width: 320, height: 100 }, mobileBelow: 999 },
  // Between the leagues on the front page and in the content on other pages
  feed: { id: 'feed', name: 'Kampliste', desktop: { width: 728, height: 90 }, mobile: { width: 320, height: 100 } },
  // Right-hand column on the front page, sticky with the column
  side: { id: 'side', name: 'Sidebanner', desktop: { width: 300, height: 600 }, mobile: { width: 300, height: 250 } },
  // Inside match, club and league pages
  content: { id: 'content', name: 'Artikelbanner', desktop: { width: 300, height: 250 }, mobile: { width: 300, height: 250 } },
  // A whole screen in the page's flow that people scroll past: the picture stands still behind a
  // window the size of the screen (an "interscroller"), across the page's full width. Only on the front page, once;
  // never a placeholder (a screen of nothing). src/components/ScrollAd.tsx
  scroll: { id: 'scroll', name: 'Helsidesannonce (scroll forbi)', desktop: { width: 1920, height: 1080 }, mobile: { width: 1080, height: 1920 }, mobileBelow: 999 },
}

/** On the front page: the first ad after about this many match rows, then one about every FEED_AD_EVERY_ROWS */
export const FEED_AD_FIRST_ROWS = 8
export const FEED_AD_EVERY_ROWS = 12
/** An ad inside a long league only when at least this many of its matches follow it */
const FEED_AD_MIN_TAIL = 4

export interface FeedAdPlan {
  /** Inside the section: after this many of its rows, the ad with this number */
  inside: { at: number; index: number }[]
  /** After the section: the ad with this number */
  after?: number
}

/**
 * Where the ads in the match list go, counted in match rows rather than leagues, so they
 * come at even intervals whether the day has many small leagues or a few long ones:
 * normally at a league boundary, inside a long league when the next spot falls well
 * before its end; never as the very last item.
 */
export function feedAdPlan(sizes: number[]): FeedAdPlan[] {
  let since = 0
  let next = FEED_AD_FIRST_ROWS
  let n = 0
  return sizes.map((size, i) => {
    const plan: FeedAdPlan = { inside: [] }
    let pos = 0
    while (size - pos >= next - since + FEED_AD_MIN_TAIL) {
      pos += next - since
      plan.inside.push({ at: pos, index: ++n })
      since = 0
      next = FEED_AD_EVERY_ROWS
    }
    since += size - pos
    if (i < sizes.length - 1 && since >= next) {
      plan.after = ++n
      since = 0
      next = FEED_AD_EVERY_ROWS
    }
    return plan
  })
}
/** On the front page: the full-screen ad after this many league sections (once) */
export const SCROLL_AD_AFTER = 5

/** The rows in chunks, an ad between them where the plan says */
export function chunksWithAds<T>(rows: T[], plan: FeedAdPlan): { rows: T[]; ad?: number }[] {
  const out: { rows: T[]; ad?: number }[] = []
  let from = 0
  for (const { at, index } of plan.inside) {
    out.push({ rows: rows.slice(from, at), ad: index })
    from = at
  }
  out.push({ rows: rows.slice(from) })
  return out
}

export const SHOW_AD_PLACEHOLDERS = process.env.NEXT_PUBLIC_AD_PLACEHOLDERS === 'true'
