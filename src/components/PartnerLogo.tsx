'use client'

import { useBadge } from './BadgeProvider'
import type { Partner } from '../data/partners'
import { sizedImage } from '../lib/imageSize'

/** A bookmaker or channel logo from public/logos/<folder>/<id>.*, or its name when there is no file */
export function PartnerLogo({
  partner,
  kind,
  height = 20,
  only,
}: {
  partner: Partner
  kind: 'bookmaker' | 'kanal'
  height?: number
  /** Render only when there is a logo file ('logo') or only when there is none ('name') */
  only?: 'logo' | 'name'
}) {
  const logo = useBadge(`${kind}:${partner.id}`)
  if ((only === 'logo' && !logo) || (only === 'name' && logo)) return null
  const content = logo ? (
    // A channel logo in a match row gets a fixed 2:1 box (centred, object-fit in the CSS), so nothing moves when it loads;
    // a bookmaker logo keeps its own width. Uploaded logos come as a small WebP in the shown size.
    // eslint-disable-next-line @next/next/no-img-element -- partner logos are local files of any size
    <img
      src={sizedImage(logo, height * 2)}
      alt={partner.name}
      width={height * 2}
      height={height}
      loading="lazy"
      decoding="async"
      style={kind === 'kanal' ? { height, width: height * 2, objectFit: 'contain' } : { height, width: 'auto' }}
    />
  ) : (
    <span className={`partner-chip partner-chip--${kind}`}>{partner.name}</span>
  )
  if (!partner.url) return <span className="partner-logo">{content}</span>
  return (
    <a className="partner-logo" href={partner.url} target="_blank" rel="sponsored nofollow noopener" title={partner.name}>
      {content}
    </a>
  )
}
