import Link from 'next/link'
import { sportOf, type Division } from '../data/leagues'
import { isUnconfirmed, type StandingRow } from '../data/season'
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
  /** Narrow version for side columns: fewer columns */
  compact?: boolean
}

export function StandingsTable({ division, rows, highlight, offset = 0, total = rows.length, compact }: Props) {
  const sport = sportOf(division)
  // Result columns per sport: football has draws, ice hockey splits overtime results
  const cols: { key: string; label: string; title: string; value: (r: StandingRow) => number }[] =
    sport === 'ice_hockey'
      ? [
          { key: 'v', label: 'V', title: 'Sejre i ordinær tid', value: (r) => r.won - r.otWon },
          { key: 'vf', label: 'VF', title: 'Sejre efter forlænget spil eller straffeslag', value: (r) => r.otWon },
          { key: 'tf', label: 'TF', title: 'Nederlag efter forlænget spil eller straffeslag', value: (r) => r.otLost },
          { key: 't', label: 'T', title: 'Nederlag i ordinær tid', value: (r) => r.lost - r.otLost },
        ]
      : sport === 'basketball'
        ? [
            { key: 'v', label: 'V', title: 'Sejre', value: (r) => r.won },
            { key: 't', label: 'T', title: 'Nederlag', value: (r) => r.lost },
          ]
        : [
            { key: 'v', label: 'V', title: 'Sejre', value: (r) => r.won },
            { key: 'u', label: 'U', title: 'Uafgjorte', value: (r) => r.drawn },
            { key: 't', label: 'T', title: 'Nederlag', value: (r) => r.lost },
          ]
  const scoreLabel = sport === 'basketball' ? 'Score' : 'Mål'
  return (
    <>
      <div className="table-wrap">
        <table className={`table${compact ? ' table--compact' : ''}`}>
          <thead>
            <tr>
              <th className="num">#</th>
              <th>Klub</th>
              <th className="num">K</th>
              {cols.map((col) => (
                <th key={col.key} className="num hide-sm" title={col.title}>
                  {col.label}
                </th>
              ))}
              <th className="num hide-sm">{scoreLabel}</th>
              <th className="num">+/-</th>
              <th className="num">P</th>
              <th className="hide-sm">Form</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const i = idx + offset
              const zone = i < division.zones.top ? 'zone--up' : i >= total - division.zones.bottom ? 'zone--down' : ''
              const gd = r.goalsFor - r.goalsAgainst
              return (
                <tr key={r.club.id} className={`${zone}${r.club.id === highlight ? ' is-highlight' : ''}`}>
                  <td className="num pos">{i + 1}</td>
                  <td>
                    <Link className="club-cell" href={paths.club(r.club.slug)}>
                      <TeamBadge link={false} name={r.club.name} colors={r.club.colors} size={28} />
                      <span className="club-cell__text">
                        <strong>{r.club.name}</strong>
                        <span>
                          {r.club.city}
                          {isUnconfirmed(r.club, division.id) && <em className="unverified"> · usikker</em>}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="num">{r.played}</td>
                  {cols.map((col) => (
                    <td key={col.key} className="num hide-sm">
                      {col.value(r)}
                    </td>
                  ))}
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
          <i className="zone-dot zone-dot--up" /> {division.zones.topLabel}
        </span>
        {division.zones.bottom > 0 && (
          <span>
            <i className="zone-dot zone-dot--down" /> Nedrykning
          </span>
        )}
        {sport === 'ice_hockey' && <span>VF/TF: efter forlænget spil eller straffeslag.</span>}
        {rows.some((r) => isUnconfirmed(r.club, division.id)) && <span>“Usikker”: klubbens række eller navn er ikke bekræftet.</span>}
      </footer>
    </>
  )
}
