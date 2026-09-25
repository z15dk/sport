import type { CSSProperties } from 'react'
import { AD_PLACEMENTS, SHOW_AD_PLACEHOLDERS, type AdPlacementId } from '../data/ads'
import { RESPONSIBLE_GAMBLING } from '../data/partners'

interface Props {
  placement: AdPlacementId
  /** Distinguishes several slots of the same placement on one page (feed-1, feed-2 …) */
  index?: number
  className?: string
}

/** A reserved advertising space; always labelled "Annonce" as Danish marketing law requires */
export function AdSlot({ placement, index, className }: Props) {
  const p = AD_PLACEMENTS[placement]
  const c = p.creative
  if (!c && !SHOW_AD_PLACEHOLDERS) return null

  const id = `ad-${placement}${index ? `-${index}` : ''}`
  const style = {
    '--ad-w': `${p.desktop.width}px`,
    '--ad-h': `${p.desktop.height}px`,
    '--ad-mw': `${p.mobile.width}px`,
    '--ad-mh': `${p.mobile.height}px`,
  } as CSSProperties

  return (
    <aside className={`ad ad--${placement}${className ? ` ${className}` : ''}`} aria-label="Annonce" style={style}>
      <span className="ad__label">Annonce</span>
      <div className="ad__box" id={id} data-ad-placement={placement}>
        {c ? (
          <a href={c.href} target="_blank" rel="sponsored nofollow noopener">
            {/* eslint-disable-next-line @next/next/no-img-element -- creatives come in any size and format */}
            <img src={c.src} alt={c.alt} />
          </a>
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
