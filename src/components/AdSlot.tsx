import type { CSSProperties } from 'react'
import { AD_PLACEMENTS, SHOW_AD_PLACEHOLDERS, type AdPlacementId } from '../data/ads'
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

/** A reserved advertising space; always labelled "Annonce" as Danish marketing law requires */
export function AdSlot({ placement, index, className }: Props) {
  // Switched on and off in the admin pages (off by default)
  const real = getRealData()
  if (real?.settings?.ads !== true) return null
  const p = AD_PLACEMENTS[placement]
  // Set in /admin/reklamer: a banner, an ad network's code, or off
  const set = real.ads?.slots?.[placement]
  if (set?.mode === 'off') return null
  const banner = set?.mode === 'image' && set.desktop ? { src: set.desktop, mobile: set.mobile, href: set.href, alt: set.alt ?? 'Annonce', gambling: set.gambling } : undefined
  const code = set?.mode === 'code' && set.code ? set.code : undefined
  // The full-screen ad: only with an ad, never a placeholder
  if (placement === 'scroll')
    return banner || code ? (
      <ScrollAd
        desktop={banner?.src}
        mobile={banner?.mobile}
        mobileBelow={p.mobileBelow ?? 700}
        href={banner?.href}
        alt={banner?.alt ?? 'Annonce'}
        code={code}
        gambling={banner?.gambling ? RESPONSIBLE_GAMBLING : undefined}
      />
    ) : null
  const c = banner ?? (code ? undefined : p.creative)
  if (!c && !code && !SHOW_AD_PLACEHOLDERS) return null

  const id = `ad-${placement}${index ? `-${index}` : ''}`
  const style = {
    '--ad-w': `${p.desktop.width}px`,
    '--ad-h': `${p.desktop.height}px`,
    '--ad-mw': `${p.mobile.width}px`,
    '--ad-mh': `${p.mobile.height}px`,
  } as CSSProperties
  const mobile = c && 'mobile' in c ? c.mobile : undefined
  const picture = c && (
    <picture>
      {mobile && <source media={`(max-width: ${p.mobileBelow ?? 700}px)`} srcSet={mobile} />}
      {/* eslint-disable-next-line @next/next/no-img-element -- creatives come in any size and format */}
      <img src={c.src} alt={c.alt} />
    </picture>
  )

  return (
    <aside className={`ad ad--${placement}${c || code ? ' ad--filled' : ''}${className ? ` ${className}` : ''}`} aria-label="Annonce" style={style}>
      <span className="ad__label">Annonce</span>
      <div className="ad__box" id={id} data-ad-placement={placement}>
        {code ? (
          <AdCode code={code} />
        ) : c ? (
          c.href ? (
            <a href={c.href} target="_blank" rel="sponsored nofollow noopener">
              {picture}
            </a>
          ) : (
            picture
          )
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
      {c?.gambling && (
        <a className="ad__rg" href={RESPONSIBLE_GAMBLING.url} target="_blank" rel="noopener nofollow">
          {RESPONSIBLE_GAMBLING.text}
        </a>
      )}
    </aside>
  )
}
