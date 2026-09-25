import Link from 'next/link'
import { formatTime, formatWeekday, isoDate } from '../lib/time'
import { paths } from '../lib/site'
import type { Match } from '../types'
import { TeamBadge } from './TeamBadge'

/** Compact match card used in the live/results strip. */
export function ScoreCard({ match, now }: { match: Match; now: number }) {
  const showScore = match.state === 'live' || match.state === 'finished'
  // Upcoming matches on another day than today show the weekday too
  const day = isoDate(match.kickoff)
  const tag =
    match.state === 'upcoming'
      ? `${day === isoDate(now) ? '' : `${formatWeekday(day)} `}${formatTime(match.kickoff)}`
      : match.statusLabel
  const lost = (a?: number, b?: number) => match.state === 'finished' && a !== undefined && b !== undefined && a < b

  return (
    <article className={`score-card score-card--${match.state}`}>
      <Link
        className="stretched-link"
        href={paths.match(match.slug)}
        aria-label={`${match.home.name} – ${match.away.name}`}
      />
      <span className="score-card__head">
        <span className="score-card__league">{match.league}</span>
        {tag && <span className="score-card__tag">{tag}</span>}
      </span>
      {[match.home, match.away].map((t, i) => {
        const other = i === 0 ? match.away : match.home
        return (
          <span key={i} className={`score-card__team${lost(t.score, other.score) ? ' is-lost' : ''}`}>
            <TeamBadge name={t.name} src={t.badge} colors={t.colors} size={26} />
            <span className="score-card__name">{t.name}</span>
            <span className="score-card__score">{showScore ? (t.score ?? '–') : ''}</span>
          </span>
        )
      })}
    </article>
  )
}
