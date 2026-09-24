import { SPORTS } from '../sports'
import type { SportId } from '../types'

interface Props {
  value: SportId
  onChange: (s: SportId) => void
}

export function SportTabs({ value, onChange }: Props) {
  return (
    <nav className="sport-tabs" aria-label="Sportsgrene">
      <div className="sport-tabs__inner">
        {SPORTS.map((s) => (
          <button
            key={s.id}
            className={`sport-tab${s.id === value ? ' is-active' : ''}`}
            onClick={() => onChange(s.id)}
            aria-current={s.id === value ? 'page' : undefined}
          >
            <span aria-hidden>{s.icon}</span>
            {s.label}
          </button>
        ))}
      </div>
    </nav>
  )
}
