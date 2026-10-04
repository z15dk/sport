'use client'

import type { StateFilter } from '../types'

interface Props {
  value: StateFilter
  onChange: (f: StateFilter) => void
  counts: Record<StateFilter, number>
  /** With "Populære" first (the front page and the day pages; not the women's pages) */
  popular?: boolean
}

const OPTIONS: { id: StateFilter; label: string }[] = [
  { id: 'popular', label: 'Populære' },
  { id: 'all', label: 'Alle' },
  { id: 'live', label: 'Live' },
  { id: 'upcoming', label: 'Kommende' },
  { id: 'finished', label: 'Afsluttede' },
]

export function FilterBar({ value, onChange, counts, popular }: Props) {
  return (
    <div className="filter-bar" role="group" aria-label="Filtrer kampe">
      {OPTIONS.filter((o) => popular || o.id !== 'popular').map((o) => (
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
