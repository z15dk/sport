'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { teamByName } from '../data/teams'
import { paths } from '../lib/site'
import { useBadge } from './BadgeProvider'

interface Props {
  name: string
  src?: string
  size?: number
  colors?: [string, string]
  /** Link the badge to the team's page when the team is known (default true) */
  link?: boolean
  /** Text for the fallback badge instead of initials from the name */
  label?: string
}

export function TeamBadge({ link = true, ...props }: Props) {
  const team = link ? teamByName(props.name) : undefined
  if (!team) return <Badge {...props} />
  return (
    <Link className="badge-link" href={paths.club(team.slug)} aria-label={`Gå til ${team.name}`} title={team.name}>
      <Badge {...props} />
    </Link>
  )
}

/** Whether each logo is (almost) all white, by URL; undefined while unknown or when the host doesn't allow reading it */
const lightLogos = new Map<string, boolean | undefined>()

/**
 * Looks at a logo's pixels: a logo whose visible pixels are mostly white or
 * very light gets a dark plate behind it, so it doesn't vanish on the page.
 * A separate image with CORS, so the shown logo loads the same either way.
 */
function useLightLogo(url?: string) {
  const [light, setLight] = useState(url ? lightLogos.get(url) : undefined)
  useEffect(() => {
    if (!url || lightLogos.has(url)) return
    lightLogos.set(url, undefined)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const n = 24
        const canvas = document.createElement('canvas')
        canvas.width = n
        canvas.height = n
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) return
        ctx.drawImage(img, 0, 0, n, n)
        const data = ctx.getImageData(0, 0, n, n).data
        let visible = 0
        let bright = 0
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 128) continue
          visible++
          const lum = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255
          if (lum > 0.88) bright++
        }
        // Mostly transparent with light marks, or light nearly everywhere visible
        const isLight = visible > 0 && bright / visible > 0.7 && visible < n * n * 0.9
        lightLogos.set(url, isLight)
        setLight(isLight)
      } catch {
        // The host doesn't allow reading the pixels: leave the logo as it is
      }
    }
    img.src = url
  }, [url])
  return light
}

function Badge({ name, src, size = 20, colors, label }: Omit<Props, 'link'>) {
  const known = useBadge(name)
  const url = src ?? known
  const [failed, setFailed] = useState(false)
  const light = useLightLogo(failed ? undefined : url)

  if (url && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- logos come from many hosts
      <img
        className={light ? 'badge badge--light' : 'badge'}
        // The plate's inner space in pixels (a percentage would follow the surrounding box, not the logo)
        style={light ? { padding: Math.max(2, Math.round(size * 0.12)), borderRadius: Math.round(size * 0.22) } : undefined}
        src={url}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        onError={() => setFailed(true)}
      />
    )
  }
  const initials = label ?? badgeInitials(name)
  return (
    <span
      className="badge badge--fallback"
      style={{
        width: size,
        height: size,
        // Scale the text to fit the circle: two letters are bigger than four
        fontSize: Math.max(6, size * (initials.length <= 2 ? 0.38 : initials.length === 3 ? 0.3 : 0.24)),
        letterSpacing: initials.length > 2 ? '-0.03em' : undefined,
        ...(colors && { background: colors[0], color: colors[1] }),
      }}
      aria-hidden
    >
      {initials}
    </span>
  )
}

// Club-type prefixes and suffixes that say nothing about which club it is
const NOISE = new Set(['fc', 'fk', 'bk', 'if', 'ik', 'ff', 'sv', 'sc', 'vfb', 'vfl', 'tsg', 'tsv', 'ssv', 'fsv', 'sg', 'spvgg', 'bsc', 'ii', 'u19', 'u21'])

/** "1. FC Köln" -> "KÖL", "FC Bayern München" -> "BM", "AGF" -> "AGF", "B.93" -> "B.93" */
export function badgeInitials(name: string) {
  const words = name.split(/\s+/).filter((w) => /^[\p{L}\d]/u.test(w))
  const meaningful = words.filter((w) => !/^\d+\.?$/.test(w) && !NOISE.has(w.toLowerCase()))
  const use = meaningful.length ? meaningful : words
  if (use.length === 1) {
    const w = use[0]
    // Keep short names with digits whole (B.93); otherwise at most three letters
    return (w.length <= 3 || /\d/.test(w) ? w : w.slice(0, 3)).toUpperCase()
  }
  return use
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}
