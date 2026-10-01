import type { CSSProperties, ReactNode } from 'react'
import { AD_PLACEMENTS, SHOW_AD_PLACEHOLDERS, creativesOf, type AdBanner, type AdPlacementId } from '../data/ads'
import { RESPONSIBLE_GAMBLING } from '../data/partners'
import { getRealData } from '../data/real'
import { AdCode } from './AdCode'
import { ScrollAd } from './ScrollAd'

interface Props {
  placement: AdPlacementId
  /** Distinguishes several slots of the same placement on one page (feed-1, feed-2 …) */
  index?: number
  className?: string
}

/**
 * One banner of a placement: a picture (with a link) or an ad network's code. With several banners
 * on the placement every one is in the page, and the visit's turn (src/data/ads.ts) shows one of them
 * before the page is drawn; hidden pictures are not loaded, hidden code is not run.
 */
export function AdBannerView({ banner, i, rotating, mobileBelow }: { banner: AdBanner; i: number; rotating: boolean; mobileBelow: number }): ReactNode {
  if (banner.kind === 'code' && banner.code) return <AdCode key={i} code={banner.code} turn={rotating ? i : undefined} />
  if (!banner.desktop) return null
  const picture = (
    <picture key={i} data-ad-i={banner.href ? undefined : i}>
      {banner.mobile && <source media={`(max-width: ${mobileBelow}px)`} srcSet={banner.mobile} />}
      {/* eslint-disable-next-line @next/next/no-img-element -- creatives come in any size and format */}
      <img src={banner.desktop} alt={banner.alt ?? 'Annonce'} loading={rotating ? 'lazy' : undefined} />
    </picture>
  )
  return banner.href ? (
    <a key={i} data-ad-i={i} href={banner.href} target="_blank" rel="sponsored nofollow noopener">
      {picture}
    </a>
  ) : (
    picture
  )
}

/** A reserved advertising space; always labelled "Annonce" as Danish marketing law requires */
export function AdSlot({ placement, index, className }: Props) {
  // Switched on and off in the admin pages (off by default)
  const real = getRealData()
  if (real?.settings?.ads !== true) return null
  const p = AD_PLACEMENTS[placement]
  // Set in /admin/reklamer: up to four banners (pictures or code) shown one per visit, or off
  const set = real.ads?.slots?.[placement]
  if (set?.mode === 'off') return null
  const banners = creativesOf(set)
  const mobileBelow = p.mobileBelow ?? 700
  // The full-screen ad: only with an ad, never a placeholder
  if (placement === 'scroll') return banners.length ? <ScrollAd banners={banners} mobileBelow={mobileBelow} gambling={RESPONSIBLE_GAMBLING} /> : null
  const fallback = banners.length ? undefined : p.creative
  if (!banners.length && !fallback && !SHOW_AD_PLACEHOLDERS) return null

  const id = `ad-${placement}${index ? `-${index}` : ''}`
  const style = {
    '--ad-w': `${p.desktop.width}px`,
    '--ad-h': `${p.desktop.height}px`,
    '--ad-mw': `${p.mobile.width}px`,
    '--ad-mh': `${p.mobile.height}px`,
    '--ad-mratio': `${p.mobile.width} / ${p.mobile.height}`,
  } as CSSProperties
  const shown: AdBanner[] = banners.length ? banners : fallback ? [{ kind: 'image', desktop: fallback.src, mobile: 'mobile' in fallback ? (fallback.mobile as string | undefined) : undefined, href: fallback.href, alt: fallback.alt, gambling: fallback.gambling }] : []
  const rotating = shown.length > 1
  const rot = rotating ? ` ad-rot ad-rot--${shown.length}` : ''

  return (
    <aside className={`ad ad--${placement}${shown.length ? ' ad--filled' : ''}${className ? ` ${className}` : ''}`} aria-label="Annonce" style={style}>
      <span className="ad__label">Annonce</span>
      <div className={`ad__box${rot}`} id={id} data-ad-placement={placement}>
        {shown.length ? (
          shown.map((b, i) => <AdBannerView key={i} banner={b} i={i} rotating={rotating} mobileBelow={mobileBelow} />)
        ) : (
          <span className="ad__placeholder">
            <strong>{p.name}</strong>
            <span className="ad__size ad__size--desktop">
              {p.desktop.width}×{p.desktop.height}
            </span>
            <span className="ad__size ad__size--mobile">
              {p.mobile.width}×{p.mobile.height}
            </span>
          </span>
        )}
      </div>
      {shown.some((b) => b.gambling) && (
        <div className={rot.trim() || undefined}>
          {shown.map((b, i) =>
            b.gambling ? (
              <a key={i} data-ad-i={i} className="ad__rg" href={RESPONSIBLE_GAMBLING.url} target="_blank" rel="noopener nofollow">
                {RESPONSIBLE_GAMBLING.text}
              </a>
            ) : (
              <span key={i} data-ad-i={i} hidden />
            ),
          )}
        </div>
      )}
    </aside>
  )
}
