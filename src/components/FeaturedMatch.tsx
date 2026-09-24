import { formatTime } from '../dates'
import { useNow } from '../hooks/useNow'
import type { Match } from '../types'
import { TeamBadge } from './TeamBadge'

function countdown(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return [h, m, s].map((n) => String(n).padStart(2, '0'))
}

/** Highlights the next kickoff (favourite leagues first), or a live match if nothing is upcoming. */
export function FeaturedMatch({ matches, pinned }: { matches: Match[]; pinned: Set<string> }) {
  const now = useNow(1000)
  const upcoming = matches
    .filter((m) => m.state === 'upcoming' && m.kickoff.getTime() > now)
    .sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime())
  const match =
    upcoming.find((m) => pinned.has(m.leagueId)) ?? upcoming[0] ?? matches.find((m) => m.state === 'live')
  if (!match) return null

  const isLive = match.state === 'live'
  const [h, m, s] = countdown(match.kickoff.getTime() - now)

  return (
    <section className="featured" aria-label="Næste kamp">
      <header className="featured__head">
        <span className="featured__eyebrow">{isLive ? 'Live nu' : 'Næste kamp'}</span>
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
        Kl. {formatTime(match.kickoff)}
        {match.venue && ` · ${match.venue}`}
      </p>
    </section>
  )
}
