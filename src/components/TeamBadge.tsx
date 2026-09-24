'use client'

import { useState } from 'react'
import { useBadge } from './BadgeProvider'

interface Props {
  name: string
  src?: string
  size?: number
  colors?: [string, string]
}

export function TeamBadge({ name, src, size = 20, colors }: Props) {
  const known = useBadge(name)
  const url = src ?? known
  const [failed, setFailed] = useState(false)

  if (url && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- logos come from many hosts
      <img
        className="badge"
        src={url}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        onError={() => setFailed(true)}
      />
    )
  }
  const initials = name
    .split(/\s+/)
    .filter((w) => /^[\p{L}\d]/u.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
  return (
    <span
      className="badge badge--fallback"
      style={{
        width: size,
        height: size,
        fontSize: Math.max(8, size * 0.36),
        ...(colors && { background: colors[0], color: colors[1] }),
      }}
      aria-hidden
    >
      {initials}
    </span>
  )
}
