'use client'

import { useState } from 'react'
import { useBadge } from './BadgeProvider'

/** A club's logo, large and faint, as a watermark in the club page's header circle */
export function BadgeWatermark({ name, src }: { name: string; src?: string }) {
  const known = useBadge(name)
  const url = src ?? known
  const [failed, setFailed] = useState(false)
  if (!url || failed) return null
  // eslint-disable-next-line @next/next/no-img-element -- logos come from many hosts
  return <img className="club-hero__mark" src={url} alt="" aria-hidden onError={() => setFailed(true)} />
}
