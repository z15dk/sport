import Link from 'next/link'
import type { Division } from '../data/danishClubs'
import type { StandingRow } from '../data/fixtures'
import { paths } from '../lib/site'
import { FormChips } from './FormChips'
import { TeamBadge } from './TeamBadge'

interface Props {
  division: Division
  rows: StandingRow[]
  highlight?: string
  /** Position of the first row minus one, when showing part of the table */
  offset?: number
  /** Clubs in the full table, for the relegation zone */
  total?: number
}

export function StandingsTable({ division, rows, highlight, offset = 0, total = rows.length }: Props) {
  const isTop = division.id === 'superliga'
  return (
    <>
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
            {rows.map((r, idx) => {
              const i = idx + offset
              const zone = i < 2 ? (isTop ? 'zone--title' : 'zone--up') : i >= total - 2 ? 'zone--down' : ''
              const gd = r.goalsFor - r.goalsAgainst
              return (
                <tr key={r.club.id} className={`${zone}${r.club.id === highlight ? ' is-highlight' : ''}`}>
                  <td className="num pos">{i + 1}</td>
                  <td>
                    <Link className="club-cell" href={paths.club(r.club.slug)}>
                      <TeamBadge name={r.club.name} colors={r.club.colors} size={28} />
                      <span className="club-cell__text">
                        <strong>{r.club.name}</strong>
                        <span>
                          {r.club.city}
                          {r.club.unverified && <em className="unverified"> · usikker</em>}
                        </span>
                      </span>
                    </Link>
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
                    <FormChips form={r.form} />
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
        {division.clubs.some((c) => c.unverified) && <span>“Usikker”: klubbens række er ikke bekræftet.</span>}
      </footer>
    </>
  )
}
