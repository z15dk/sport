'use client'

import { useBadge } from './BadgeProvider'
import type { Partner } from '../data/partners'

/** A bookmaker or channel logo from public/logos/<folder>/<id>.*, or its name when there is no file */
export function PartnerLogo({ partner, kind, height = 20 }: { partner: Partner; kind: 'bookmaker' | 'kanal'; height?: number }) {
  const logo = useBadge(`${kind}:${partner.id}`)
  const content = logo ? (
    // eslint-disable-next-line @next/next/no-img-element -- partner logos are local files of any size
    <img src={logo} alt={partner.name} height={height} style={{ height, width: 'auto' }} />
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
