import { formatTime } from '../dates'
import type { Match } from '../types'

interface Props {
  matches: Match[]
  updatedAt: Date | null
  isDemo: boolean
  onRefresh: () => void
}

export function StatTiles({ matches, updatedAt, isDemo, onRefresh }: Props) {
  const live = matches.filter((m) => m.state === 'live').length
  const finished = matches.filter((m) => m.state === 'finished').length
  const goals = matches.reduce((sum, m) => sum + (m.home.score ?? 0) + (m.away.score ?? 0), 0)

  return (
    <section className="tiles" aria-label="Dagens tal">
      <div className="tile tile--lime">
        <span className="tile__label">Kampe</span>
        <strong className="tile__value">{matches.length}</strong>
      </div>
      <div className="tile tile--live">
        <span className="tile__label">Live</span>
        <strong className="tile__value">{live}</strong>
      </div>
      <div className="tile tile--ink">
        <span className="tile__label">Afsluttet</span>
        <strong className="tile__value">{finished}</strong>
      </div>
      <div className="tile tile--blush">
        <span className="tile__label">Mål/point</span>
        <strong className="tile__value">{goals}</strong>
      </div>
      <p className="tiles__source">
        {isDemo ? 'Demodata' : 'Data: TheSportsDB'}
        {updatedAt && ` · ${formatTime(updatedAt)}`}
        <button className="text-btn" onClick={onRefresh}>
          Opdater
        </button>
      </p>
    </section>
  )
}
