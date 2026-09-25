'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { addDays, formatDayMonth, formatWeekday } from '../lib/time'
import { paths } from '../lib/site'

interface Props {
  selected: string
  today: string
  sport: string
}

// From yesterday to ten days ahead
const RANGE = Array.from({ length: 12 }, (_, i) => i - 1)

export function DateStrip({ selected, today, sport }: Props) {
  const days = useRef<HTMLDivElement>(null)
  // Keep the chosen day in view when the strip scrolls sideways
  useEffect(() => {
    const active = days.current?.querySelector<HTMLElement>('.is-active')
    if (active && days.current) days.current.scrollLeft = active.offsetLeft - days.current.clientWidth / 2 + active.clientWidth / 2
  }, [selected])

  const href = (date: string) => paths.home({ sport, dato: date === today ? undefined : date })
  const label = (d: string) =>
    d === today ? 'I dag' : d === addDays(today, -1) ? 'I går' : d === addDays(today, 1) ? 'I morgen' : formatWeekday(d)

  return (
    <nav className="date-strip" aria-label="Vælg dato">
      <Link className="date-strip__arrow" href={href(addDays(selected, -1))} aria-label="Forrige dag">
        ‹
      </Link>
      <div className="date-strip__days" ref={days}>
      {RANGE.map((offset) => {
        // The strip stays put around today; a day outside it moves the strip along
        const start = selected < addDays(today, -1) || selected > addDays(today, 10) ? selected : today
        const d = addDays(start, offset)
        const active = d === selected
        return (
          <Link
            key={offset}
            href={href(d)}
            aria-current={active ? 'date' : undefined}
            className={`date-chip${active ? ' is-active' : ''}`}
          >
            <span className="date-chip__day">{label(d)}</span>
            <span className="date-chip__date">{formatDayMonth(d)}</span>
          </Link>
        )
      })}
      </div>
      <Link className="date-strip__arrow" href={href(addDays(selected, 1))} aria-label="Næste dag">
        ›
      </Link>
    </nav>
  )
}
