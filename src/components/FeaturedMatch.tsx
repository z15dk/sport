'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useNow } from '../hooks/useNow'
import { formatLong, formatTime, isoDate } from '../lib/time'
import { paths } from '../lib/site'
import type { Match } from '../types'
import { TeamBadge } from './TeamBadge'
import { MatchOdds, OddsBy } from './MatchExtras'
import { oddsFor } from '../data/odds'
import { hashString, seeded } from '../data/fixtures'
import { RESPONSIBLE_GAMBLING } from '../data/partners'

function countdown(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return [h, m, s].map((n) => String(n).padStart(2, '0'))
}

interface Props {
  /** Matches kicking off 12-24 hours from now; one is picked at random */
  candidates: Match[]
  /** The day's matches, used when there are no candidates */
  matches: Match[]
  pinned: Set<string>
  now: number
  /** Changes every hour, so the pick stays put within the hour and is the same on server and browser */
  seed: string
}

/** How long each match stays in focus before the next one */
const ROTATE_MS = 10_000

/** The candidates in a random order that is the same on server and browser for the hour */
function shuffled(pool: Match[], seed: string) {
  const rand = seeded(hashString(seed))
  const out = [...pool]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * A match in focus: rotating through up to 8 of those kicking off in 12-24 hours
 * (favourite leagues first), with odds. Without any, the day's next kickoff
 * or a live match.
 */
export function FeaturedMatch({ candidates, matches, pinned, now, seed }: Props) {
  // The countdown ticks every second
  const clock = useNow(1000, now)
  const favourites = candidates.filter((m) => pinned.has(m.leagueId))
  const upcoming = matches
    .filter((m) => m.state === 'upcoming' && m.kickoff.getTime() > now)
    .sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime())
  // Up to 8 picks: the 12-24 hour window, topped up with the next kickoffs when it has few
  const picked = shuffled(favourites.length ? favourites : candidates, seed)
  const pool = (picked.length >= 3 ? picked : [...picked, ...upcoming.filter((m) => !picked.some((p) => p.id === m.id))]).slice(0, 8)
  // Rotates through the picks; paused while the pointer or focus is on the box
  const [step, setStep] = useState(0)
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    if (pool.length < 2 || paused) return
    const id = window.setInterval(() => setStep((n) => n + 1), ROTATE_MS)
    return () => window.clearInterval(id)
  }, [pool.length, paused])
  const index = pool.length ? step % pool.length : 0
  const match =
    pool[index] ??
    upcoming.find((m) => pinned.has(m.leagueId)) ??
    upcoming[0] ??
    matches.find((m) => m.state === 'live')
  if (!match) return null
  const odds = match.state === 'upcoming' ? oddsFor(match) : undefined

  const isLive = match.state === 'live'
  const [h, m, s] = countdown(match.kickoff.getTime() - clock)

  return (
    <section
      className="featured"
      aria-label="Kamp i fokus"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <header className="featured__head">
        <span className="featured__eyebrow">{isLive ? 'Live nu' : 'Kamp i fokus'}</span>
        <span className="featured__league">{match.league}</span>
      </header>
      <div className="featured__teams" key={match.id}>
        <div className="featured__team">
          <TeamBadge name={match.home.name} src={match.home.badge} colors={match.home.colors} size={56} />
          <span>{match.home.name}</span>
        </div>
        <span className="featured__vs">
          {isLive ? `${match.home.score ?? 0}–${match.away.score ?? 0}` : 'VS'}
        </span>
        <div className="featured__team">
          <TeamBadge name={match.away.name} src={match.away.badge} colors={match.away.colors} size={56} />
          <span>{match.away.name}</span>
        </div>
      </div>
      {isLive ? (
        <p className="featured__foot">{match.statusLabel}</p>
      ) : (
        <div className="featured__countdown" aria-label={`Kampstart kl. ${formatTime(match.kickoff)}`}>
          <div>
            <strong>{h}</strong>
            <span>timer</span>
          </div>
          <div>
            <strong>{m}</strong>
            <span>min</span>
          </div>
          <div>
            <strong>{s}</strong>
            <span>sek</span>
          </div>
        </div>
      )}
      <p className="featured__meta">
        {isoDate(match.kickoff) === isoDate(clock) ? 'I dag' : formatLong(match.kickoff)} kl. {formatTime(match.kickoff)}
        {match.venue && ` · ${match.venue}`}
      </p>
      {odds && (
        <div className="featured__odds">
          <MatchOdds odds={odds} />
          <OddsBy />
          <a className="featured__rg" href={RESPONSIBLE_GAMBLING.url} target="_blank" rel="noopener nofollow">
            {RESPONSIBLE_GAMBLING.text}
          </a>
        </div>
      )}
      <Link className="featured__cta" href={paths.match(match.slug)}>
        Se statistik og indbyrdes opgør →
      </Link>
      {pool.length > 1 && (
        <nav className="featured__nav" aria-label="Skift kamp">
          <button type="button" aria-label="Forrige kamp" onClick={() => setStep((n) => n - 1 + pool.length)}>
            ‹
          </button>
          {pool.map((p, i) => (
            <button
              key={p.id}
              type="button"
              className={`featured__dot${i === index ? ' is-active' : ''}`}
              aria-label={`${p.home.name} – ${p.away.name}`}
              aria-current={i === index}
              onClick={() => setStep(i)}
            />
          ))}
          <button type="button" aria-label="Næste kamp" onClick={() => setStep((n) => n + 1)}>
            ›
          </button>
        </nav>
      )}
    </section>
  )
}
