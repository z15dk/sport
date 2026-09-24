import { SPORTS } from '../sports'
import type { SportId } from '../types'
import { SportIcon } from './SportIcon'

interface Props {
  value: SportId
  onChange: (s: SportId) => void
}

export function SportRail({ value, onChange }: Props) {
  return (
    <nav className="rail" aria-label="Sportsgrene">
      <a className="rail__logo" href="/" aria-label="Scoreline forside">
        S<span>.</span>
      </a>
      <div className="rail__items">
        {SPORTS.map((s) => (
          <button
            key={s.id}
            className={`rail__item${s.id === value ? ' is-active' : ''}`}
            onClick={() => onChange(s.id)}
            aria-current={s.id === value ? 'page' : undefined}
            title={s.label}
          >
            <SportIcon sport={s.id} />
            <span className="rail__label">{s.label}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}
