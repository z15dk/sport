'use client'

import Link from 'next/link'
import { useState } from 'react'
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

function Badge({ name, src, size = 20, colors, label }: Omit<Props, 'link'>) {
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
