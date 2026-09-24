import { formatLong, formatTime } from '../dates'
import type { Match } from '../types'

interface Props {
  date: Date
  matches: Match[]
  updatedAt: Date | null
  isDemo: boolean
  error: string | null
  onRefresh: () => void
}

export function SummaryPanel({ date, matches, updatedAt, isDemo, error, onRefresh }: Props) {
  const live = matches.filter((m) => m.state === 'live').length
  const finished = matches.filter((m) => m.state === 'finished').length
  const now = updatedAt?.getTime() ?? 0
  const next = matches
    .filter((m) => m.state === 'upcoming' && m.kickoff.getTime() > now)
    .sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime())[0]

  return (
    <aside className="summary" aria-label="Overblik">
      <div className="card">
        <h2 className="card__title">Overblik</h2>
        <p className="summary__date">{formatLong(date)}</p>
        <dl className="stats">
          <div>
            <dt>Kampe</dt>
            <dd>{matches.length}</dd>
          </div>
          <div className="stats--live">
            <dt>Live</dt>
            <dd>{live}</dd>
          </div>
          <div>
            <dt>Afsluttet</dt>
            <dd>{finished}</dd>
          </div>
        </dl>
        {next && (
          <div className="next-up">
            <span className="muted small">Næste kamp · {formatTime(next.kickoff)}</span>
            <strong>
              {next.home.name} – {next.away.name}
            </strong>
            <span className="muted small">{next.league}</span>
          </div>
        )}
      </div>

      <div className="card">
        <div className="source">
          <span className="muted small">
            {isDemo ? 'Demodata' : 'Data fra TheSportsDB'}
            {updatedAt && ` · opdateret ${formatTime(updatedAt)}`}
          </span>
          <button className="text-btn" onClick={onRefresh}>
            Opdater
          </button>
        </div>
        {error && <p className="notice small">Kunne ikke hente kampe ({error}). Viser demodata i stedet.</p>}
      </div>
    </aside>
  )
}
