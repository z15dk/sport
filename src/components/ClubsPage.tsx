import { useMemo, useState } from 'react'
import { DIVISIONS, SEASON } from '../data/danishClubs'
import { standings } from '../data/fixtures'
import { TeamBadge } from './TeamBadge'

const ROUNDS_PLAYED = 10

export function ClubsPage() {
  const [divId, setDivId] = useState(DIVISIONS[0].id)
  const div = DIVISIONS.find((d) => d.id === divId)!
  const rows = useMemo(() => standings(div, ROUNDS_PLAYED), [div])
  const isTop = div.id === 'superliga'
  const unverified = div.clubs.filter((c) => c.unverified)

  return (
    <div className="clubs">
      <div className="clubs__head">
        <h1 className="feed__title">
          Danske klubber
          <span>
            Sæson {SEASON} · {DIVISIONS.reduce((n, d) => n + d.clubs.length, 0)} klubber i fire rækker
          </span>
        </h1>
        <div className="filter-bar" role="tablist" aria-label="Række">
          {DIVISIONS.map((d) => (
            <button
              key={d.id}
              role="tab"
              aria-selected={d.id === divId}
              className={`pill${d.id === divId ? ' is-active' : ''}`}
              onClick={() => setDivId(d.id)}
            >
              {d.name}
            </button>
          ))}
        </div>
      </div>

      <section className="panel table-panel">
        <header className="table-panel__head">
          <h2 className="panel__title">Stilling · {div.name}</h2>
          <span className="tag">Fiktiv · efter {ROUNDS_PLAYED} runder</span>
        </header>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="num">#</th>
                <th>Klub</th>
                <th className="num">K</th>
                <th className="num hide-sm">V</th>
                <th className="num hide-sm">U</th>
                <th className="num hide-sm">T</th>
                <th className="num hide-sm">Mål</th>
                <th className="num">+/-</th>
                <th className="num">P</th>
                <th className="hide-sm">Form</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const zone = i < 2 ? (isTop ? 'zone--title' : 'zone--up') : i >= rows.length - 2 ? 'zone--down' : ''
                const gd = r.goalsFor - r.goalsAgainst
                return (
                  <tr key={r.club.id} className={zone}>
                    <td className="num pos">{i + 1}</td>
                    <td>
                      <span className="club-cell">
                        <TeamBadge name={r.club.name} colors={r.club.colors} size={28} />
                        <span className="club-cell__text">
                          <strong>{r.club.name}</strong>
                          <span>
                            {r.club.city}
                            {r.club.unverified && <em className="unverified"> · usikker</em>}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="num">{r.played}</td>
                    <td className="num hide-sm">{r.won}</td>
                    <td className="num hide-sm">{r.drawn}</td>
                    <td className="num hide-sm">{r.lost}</td>
                    <td className="num hide-sm">
                      {r.goalsFor}-{r.goalsAgainst}
                    </td>
                    <td className="num">{gd > 0 ? `+${gd}` : gd}</td>
                    <td className="num pts">{r.points}</td>
                    <td className="hide-sm">
                      <span className="form">
                        {r.form.slice(-5).map((f, k) => (
                          <span key={k} className={`form__chip form__chip--${f}`}>
                            {f}
                          </span>
                        ))}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <footer className="table-legend">
          <span>
            <i className="zone-dot zone-dot--up" /> {isTop ? 'Mesterskabsspil (top)' : 'Oprykning'}
          </span>
          <span>
            <i className="zone-dot zone-dot--down" /> Nedrykning
          </span>
          {unverified.length > 0 && (
            <span>“Usikker”: klubbens række i {SEASON} er ikke bekræftet.</span>
          )}
        </footer>
      </section>
    </div>
  )
}
