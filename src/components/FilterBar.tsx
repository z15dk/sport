import type { StateFilter } from '../types'

interface Props {
  value: StateFilter
  onChange: (f: StateFilter) => void
  counts: Record<StateFilter, number>
}

const OPTIONS: { id: StateFilter; label: string }[] = [
  { id: 'all', label: 'Alle' },
  { id: 'live', label: 'Live' },
  { id: 'upcoming', label: 'Kommende' },
  { id: 'finished', label: 'Afsluttede' },
]

export function FilterBar({ value, onChange, counts }: Props) {
  return (
    <div className="filter-bar" role="group" aria-label="Filtrer kampe">
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          className={`pill${value === o.id ? ' is-active' : ''}${o.id === 'live' ? ' pill--live' : ''}`}
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
        >
          {o.id === 'live' && <span className="live-dot" aria-hidden />}
          {o.label}
          <span className="pill__count">{counts[o.id]}</span>
        </button>
      ))}
    </div>
  )
}
