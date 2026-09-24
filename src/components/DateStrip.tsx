import Link from 'next/link'
import { addDays, formatDayMonth, formatWeekday } from '../lib/time'
import { paths } from '../lib/site'

interface Props {
  selected: string
  today: string
  sport: string
}

const RANGE = [-3, -2, -1, 0, 1, 2, 3]

export function DateStrip({ selected, today, sport }: Props) {
  const href = (date: string) => paths.home({ sport, dato: date === today ? undefined : date })
  const label = (d: string) =>
    d === today ? 'I dag' : d === addDays(today, -1) ? 'I går' : d === addDays(today, 1) ? 'I morgen' : formatWeekday(d)

  return (
    <nav className="date-strip" aria-label="Vælg dato">
      <Link className="date-strip__arrow" href={href(addDays(selected, -1))} aria-label="Forrige dag">
        ‹
      </Link>
      {RANGE.map((offset) => {
        const d = addDays(selected, offset)
        const active = offset === 0
        return (
          <Link
            key={offset}
            href={href(d)}
            aria-current={active ? 'date' : undefined}
            className={`date-chip${active ? ' is-active' : ''}${Math.abs(offset) > 1 ? ' is-far' : ''}`}
          >
            <span className="date-chip__day">{label(d)}</span>
            <span className="date-chip__date">{formatDayMonth(d)}</span>
          </Link>
        )
      })}
      <Link className="date-strip__arrow" href={href(addDays(selected, 1))} aria-label="Næste dag">
        ›
      </Link>
    </nav>
  )
}
