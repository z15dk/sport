'use client'

import Link from 'next/link'
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

/**
 * A match in focus: picked at random among those kicking off in 12-24 hours
 * (favourite leagues first), with odds. Without any, the day's next kickoff
 * or a live match.
 */
export function FeaturedMatch({ candidates, matches, pinned, now, seed }: Props) {
  const favourites = candidates.filter((m) => pinned.has(m.leagueId))
  const pool = favourites.length ? favourites : candidates
  const upcoming = matches
    .filter((m) => m.state === 'upcoming' && m.kickoff.getTime() > now)
    .sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime())
  const match =
    (pool.length ? pool[Math.floor(seeded(hashString(seed))() * pool.length)] : undefined) ??
    upcoming.find((m) => pinned.has(m.leagueId)) ??
    upcoming[0] ??
    matches.find((m) => m.state === 'live')
  if (!match) return null
  const odds = match.state === 'upcoming' ? oddsFor(match) : undefined

  const isLive = match.state === 'live'
  const [h, m, s] = countdown(match.kickoff.getTime() - now)

  return (
    <section className="featured" aria-label="Næste kamp">
      <header className="featured__head">
        <span className="featured__eyebrow">{isLive ? 'Live nu' : 'Kamp i fokus'}</span>
        <span className="featured__league">{match.league}</span>
      </header>
      <div className="featured__teams">
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
        {isoDate(match.kickoff) === isoDate(now) ? 'I dag' : formatLong(match.kickoff)} kl. {formatTime(match.kickoff)}
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
    </section>
  )
}
