import { addDays, formatDayMonth, formatWeekday, isSameDay } from '../dates'

interface Props {
  selected: Date
  onSelect: (d: Date) => void
}

const RANGE = [-3, -2, -1, 0, 1, 2, 3]

export function DateStrip({ selected, onSelect }: Props) {
  const today = new Date()
  return (
    <div className="date-strip" role="tablist" aria-label="Vælg dato">
      <button className="date-strip__arrow" onClick={() => onSelect(addDays(selected, -1))} aria-label="Forrige dag">
        ‹
      </button>
      {RANGE.map((offset) => {
        const d = addDays(selected, offset)
        const active = offset === 0
        const label = isSameDay(d, today)
          ? 'I dag'
          : isSameDay(d, addDays(today, -1))
            ? 'I går'
            : isSameDay(d, addDays(today, 1))
              ? 'I morgen'
              : formatWeekday(d)
        return (
          <button
            key={offset}
            role="tab"
            aria-selected={active}
            className={`date-chip${active ? ' is-active' : ''}${Math.abs(offset) > 1 ? ' is-far' : ''}`}
            onClick={() => onSelect(d)}
          >
            <span className="date-chip__day">{label}</span>
            <span className="date-chip__date">{formatDayMonth(d)}</span>
          </button>
        )
      })}
      <button className="date-strip__arrow" onClick={() => onSelect(addDays(selected, 1))} aria-label="Næste dag">
        ›
      </button>
    </div>
  )
}
