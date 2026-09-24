import { formatTime } from '../lib/time'
import type { Match } from '../types'
import type { DataSource } from './MatchesView'

interface Props {
  matches: Match[]
  updatedAt: Date | null
  source: DataSource
  onSourceChange: (s: DataSource) => void
  onRefresh: () => void
}

export function StatTiles({ matches, updatedAt, source, onSourceChange, onRefresh }: Props) {
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
      <div className="tiles__source">
        <div className="switch" role="group" aria-label="Datakilde">
          <button className={source === 'fictional' ? 'is-active' : ''} aria-pressed={source === 'fictional'} onClick={() => onSourceChange('fictional')}>
            Fiktive
          </button>
          <button className={source === 'api' ? 'is-active' : ''} aria-pressed={source === 'api'} onClick={() => onSourceChange('api')}>
            Live-data
          </button>
        </div>
        {updatedAt && <span>Opdateret {formatTime(updatedAt)}</span>}
        <button className="text-btn" onClick={onRefresh}>
          Opdater
        </button>
      </div>
    </section>
  )
}
