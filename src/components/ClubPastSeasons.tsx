import Link from 'next/link'
import type { Division } from '../data/leagues'
import type { PastSeason, SeasonTableRow } from '../lib/history'
import { paths } from '../lib/site'
import { formatShortYear } from '../lib/time'

// A club's earlier seasons (those with a page of their own): its place, and
// every match that season with a link to the match's page.

interface Entry {
  division: Division
  season: PastSeason
  row: SeasonTableRow
}

export function ClubPastSeasons({ name, entries }: { name: string; entries: Entry[] }) {
  if (!entries.length) return null
  return (
    <section className="panel">
      <h2 className="panel__title">Tidligere sæsoner</h2>
      <ul className="club-seasons">
        {entries.map(({ division, season, row }) => {
          const games = season.games.filter((g) => g.home === name || g.away === name)
          return (
            <li key={`${division.id}|${season.slug}`}>
              <details>
                <summary>
                  <strong>{season.label}</strong> {division.name} · nr. {row.rank}
                  {season.hasDraws ? ` · ${row.points} point` : ` · ${row.won} sejre`}
                </summary>
                <p className="small">
                  <Link href={`${paths.league(division.slug)}/${season.slug}`}>
                    Slutstilling og topscorere i {division.name} {season.label} →
                  </Link>
                </p>
                <ul className="season-games">
                  {games.map((g) => (
                    <li key={g.id}>
                      <span className="muted small">{formatShortYear(g.date)}</span>
                      {g.slug ? (
                        <Link href={paths.match(g.slug)}>
                          {g.home} – {g.away}
                        </Link>
                      ) : (
                        <span>
                          {g.home} – {g.away}
                        </span>
                      )}
                      <strong>
                        {g.homeScore}-{g.awayScore}
                      </strong>
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
