import { formatTime } from '../dates'
import type { Match } from '../types'
import { TeamBadge } from './TeamBadge'

/** Compact match card used in the live/results strip. */
export function ScoreCard({ match, onOpen }: { match: Match; onOpen: (m: Match) => void }) {
  const showScore = match.state === 'live' || match.state === 'finished'
  const tag = match.state === 'upcoming' ? formatTime(match.kickoff) : match.statusLabel
  const lost = (a?: number, b?: number) => match.state === 'finished' && a !== undefined && b !== undefined && a < b

  return (
    <button
      className={`score-card score-card--${match.state}`}
      onClick={() => onOpen(match)}
      aria-label={`${match.home.name} mod ${match.away.name} – se kampdetaljer`}
    >
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
    </button>
  )
}
