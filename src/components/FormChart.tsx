'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { clubMatches } from '../data/matches'
import { useNow } from '../hooks/useNow'
import { OUTCOME_LABEL, outcomeFor } from '../lib/result'
import { paths } from '../lib/site'
import { formatShortYear } from '../lib/time'
import { TeamBadge } from './TeamBadge'

const COUNT = 9
const MAX = 4 // performance value that fills half the chart height

/**
 * "Seneste form": one bar per recent match. Up for a win, down for a loss,
 * short for a draw; the height is the goal difference nudged by shots on target.
 */
export function FormChart({ clubName, initialNow }: { clubName: string; initialNow: number }) {
  const now = useNow(60_000, initialNow)
  const recent = useMemo(
    () => clubMatches(clubName, now).filter((m) => m.state === 'finished').slice(-COUNT),
    [clubName, now],
  )
  const [hover, setHover] = useState<number | null>(null)

  const items = recent.map((m) => {
    const isHome = m.home.name === clubName
    const own = (isHome ? m.home.score : m.away.score) ?? 0
    const other = (isHome ? m.away.score : m.home.score) ?? 0
    const outcome = outcomeFor(m, clubName)!
    // A typical winning margin is ~1 goal in football/hockey and ~8 points in basketball
    const margin = m.sport === 'basketball' ? 8 : 1
    let value = (own - other) / margin
    // Keep the direction true to the result and give every bar a visible height
    if (outcome === 'V') value = Math.max(0.6, value)
    else if (outcome === 'T') value = Math.min(-0.6, value)
    else value = 0.25
    if (m.sport !== 'soccer' && outcome !== 'U' && m.statusLabel !== 'Slut') value = Math.sign(value) * 0.6 // overtime: narrow result
    return { match: m, outcome, value: Math.max(-MAX, Math.min(MAX, value)), opponent: isHome ? m.away : m.home }
  })

  if (items.length === 0) return null
  const active = hover !== null ? items[hover] : undefined

  return (
    <section className="panel form-chart" aria-labelledby="form-chart-title">
      <header className="form-chart__head">
        <h2 id="form-chart-title" className="panel__title">
          Seneste form
        </h2>
        <span
          className="info"
          title="Søjlens højde viser sejrs- eller nederlagsmarginen. Op er sejr, ned er nederlag, og korte grå søjler er uafgjort. Kampe afgjort i forlænget spil vises som små søjler."
          aria-label="Om grafen"
        >
          i
        </span>
      </header>
      <p className="form-chart__hint">
        {active
          ? `${formatShortYear(active.match.kickoff)} · ${active.match.league}: ${active.match.home.name} ${active.match.home.score}–${active.match.away.score} ${active.match.away.name}`
          : 'Hold markøren over en søjle for at se resultatet'}
      </p>

      <div className="form-chart__plot" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((it, i) => (
          <div key={it.match.id} className="form-chart__col">
            <TeamBadge name={it.opponent.name} src={it.opponent.badge} colors={it.opponent.colors} size={30} />
            <Link
              href={paths.match(it.match.slug)}
              className={`form-chart__bar-area${hover === i ? ' is-hover' : ''}`}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              aria-label={`${OUTCOME_LABEL[it.outcome]}: ${it.match.home.name} ${it.match.home.score}–${it.match.away.score} ${it.match.away.name}`}
            >
              <span
                className={`form-chart__bar form-chart__bar--${it.outcome} ${it.value >= 0 ? 'is-up' : 'is-down'}`}
                style={{ height: `${(Math.abs(it.value) / MAX) * 50}%` }}
              />
            </Link>
            <span className={`form-chart__label form-chart__label--${it.outcome}`}>{it.outcome}</span>
          </div>
        ))}
      </div>

      <table className="visually-hidden">
        <caption>Seneste {items.length} kampe for {clubName}</caption>
        <thead>
          <tr>
            <th>Dato</th>
            <th>Kamp</th>
            <th>Resultat</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.match.id}>
              <td>{formatShortYear(it.match.kickoff)}</td>
              <td>
                {it.match.home.name} {it.match.home.score}–{it.match.away.score} {it.match.away.name}
              </td>
              <td>{OUTCOME_LABEL[it.outcome]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
