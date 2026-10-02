'use client'

import { useState } from 'react'
import type { Lineup } from '../data/matchExtra'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { sizedImage } from '../lib/imageSize'
import { playerPath } from '../data/player'

// The two line-ups drawn on a pitch: the away team from the top, the home
// team from the bottom, each row of the formation as a line of players.
// A player with a photo links to his page (nofollow: each page costs requests
// to the source, so search engines are not sent through every line-up).

/** The player's page around `children` when he has one and a photo, else just `children` */
function PlayerLink({ id, name, photo, className, children }: { id?: number; name: string; photo?: string; className?: string; children: ReactNode }) {
  if (!id || !photo) return className ? <span className={className}>{children}</span> : <>{children}</>
  return (
    <Link className={className ? `${className} is-link` : 'is-link'} href={playerPath(id, name)} rel="nofollow" prefetch={false} title={`${name} – spillerside`}>
      {children}
    </Link>
  )
}

const short = (name: string) => {
  const parts = name.split(' ')
  return parts.length > 1 ? parts.slice(1).join(' ') : name
}

/** A team's starting players by formation row (1 is the goalkeeper), each row left to right */
function rows(lineup: Lineup) {
  const byRow = new Map<number, { name: string; number?: number; photo?: string; id?: number; col: number }[]>()
  for (const p of lineup.startXI) {
    const [r, c] = (p.grid ?? '').split(':').map(Number)
    if (!r) return undefined
    byRow.set(r, [...(byRow.get(r) ?? []), { name: p.name, number: p.number, photo: p.photo, id: p.id, col: c || 0 }])
  }
  return [...byRow.entries()].sort(([a], [b]) => a - b).map(([, players]) => players.sort((a, b) => a.col - b.col))
}

/** The player's photo in the circle with the shirt number beside it, else the number alone (also when the photo fails) */
function Shirt({ number, photo }: { number?: number; photo?: string }) {
  const [failed, setFailed] = useState(false)
  if (!photo || failed) return <span className="pitch__shirt">{number ?? ''}</span>
  return (
    <span className="pitch__shirt pitch__shirt--photo">
      {/* eslint-disable-next-line @next/next/no-img-element -- through our own image proxy, in the size shown */}
      <img src={sizedImage(photo, 96)} alt="" width={40} height={40} loading="lazy" onError={() => setFailed(true)} />
      {number !== undefined && <b className="pitch__no">{number}</b>}
    </span>
  )
}

/** A small photo before a name in the lists (nothing when there is none) */
function Face({ photo }: { photo?: string }) {
  const [failed, setFailed] = useState(false)
  if (!photo || failed) return null
  // eslint-disable-next-line @next/next/no-img-element -- through our own image proxy, in the size shown
  return <img className="lineups__face" src={sizedImage(photo, 48)} alt="" width={22} height={22} loading="lazy" onError={() => setFailed(true)} />
}

function Half({ lineup, side }: { lineup: Lineup; side: 'home' | 'away' }) {
  const lines = rows(lineup)
  if (!lines) return null
  // Away: goalkeeper at the top; home: goalkeeper at the bottom
  const ordered = side === 'away' ? lines : [...lines].reverse()
  return (
    <div className={`pitch__half pitch__half--${side}`}>
      {ordered.map((line, i) => (
        <div key={i} className="pitch__line">
          {(side === 'away' ? [...line].reverse() : line).map((p) => (
            <PlayerLink key={`${p.number}-${p.name}`} className="pitch__player" id={p.id} name={p.name} photo={p.photo}>
              <Shirt number={p.number} photo={p.photo} />
              <span className="pitch__name">{short(p.name)}</span>
            </PlayerLink>
          ))}
        </div>
      ))}
    </div>
  )
}

export function LineupPitch({ lineups }: { lineups: [Lineup, Lineup] }) {
  const [home, away] = lineups
  const drawable = rows(home) && rows(away)
  return (
    <div className="lineups">
      {drawable && (
        <div className="pitch" aria-label="Startopstillinger på banen">
          <span className="pitch__formation pitch__formation--away">
            {away.team} {away.formation}
          </span>
          <Half lineup={away} side="away" />
          <Half lineup={home} side="home" />
          <span className="pitch__formation pitch__formation--home">
            {home.team} {home.formation}
          </span>
        </div>
      )}
      <div className="lineups__lists">
        {[home, away].map((t) => (
          <div key={t.team} className="lineups__team">
            <h3>
              {t.team} {t.formation && <em>{t.formation}</em>}
            </h3>
            {!drawable && (
              <ol className="lineups__list">
                {t.startXI.map((p) => (
                  <li key={`${p.number}-${p.name}`}>
                    <span className="lineups__no">{p.number}</span>
                    <span className="lineups__name">
                      <PlayerLink id={p.id} name={p.name} photo={p.photo}>
                        <Face photo={p.photo} /> {p.name}
                      </PlayerLink>
                    </span>
                  </li>
                ))}
              </ol>
            )}
            {t.substitutes.length > 0 && (
              <>
                <h4>Udskiftere</h4>
                <ol className="lineups__list lineups__list--subs">
                  {t.substitutes.map((p) => (
                    <li key={`${p.number}-${p.name}`}>
                      <span className="lineups__no">{p.number}</span>
                      <span className="lineups__name">
                        <PlayerLink id={p.id} name={p.name} photo={p.photo}>
                          <Face photo={p.photo} /> {p.name}
                        </PlayerLink>
                      </span>
                    </li>
                  ))}
                </ol>
              </>
            )}
            {t.coach && (
              <p className="lineups__coach">
                <span>Træner</span> {t.coach}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
