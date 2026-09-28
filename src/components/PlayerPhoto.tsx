'use client'

import { useState } from 'react'
import { sizedImage } from '../lib/imageSize'
import { TeamBadge } from './TeamBadge'

/** A player's photo in a list; without one (or when it doesn't load) the club's logo */
export function PlayerPhoto({ photo, team, teamLogo, colors, size = 28 }: { photo?: string; team: string; teamLogo?: string; colors?: [string, string]; size?: number }) {
  const [failed, setFailed] = useState(false)
  if (photo && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- pictures through our own domain in the size shown
      <img className="player-photo" src={sizedImage(photo, size)} alt="" width={size} height={size} loading="lazy" onError={() => setFailed(true)} />
    )
  }
  return <TeamBadge link={false} name={team} src={teamLogo} colors={colors} size={size} />
}
