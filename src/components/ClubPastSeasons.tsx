import Link from 'next/link'
import type { Division } from '../data/leagues'
import { seasonGameAsMatch, type PastSeason, type SeasonTableRow } from '../lib/history'
import { paths } from '../lib/site'
import { MatchRow } from './MatchRow'

// A club's earlier seasons (those with a page of their own): its place, and
// every match that season as the match lists show them, linked to the match's page.

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
          const games = season.games.filter((g) => g.slug && (g.home === name || g.away === name))
          return (
            <li key={`${division.id}|${season.slug}`}>
              <details>
                <summary>
                  <span className="club-seasons__year">{season.label}</span>
                  <span className="club-seasons__league">{division.name}</span>
                  <span className="club-seasons__place">
                    {row.rank}. plads{season.hasDraws ? ` · ${row.points} p` : ` · ${row.won} sejre`}
                  </span>
                </summary>
                <p className="club-seasons__link">
                  <Link href={`${paths.league(division.slug)}/${season.slug}`}>Slutstilling og topscorere →</Link>
                </p>
                <ul className="league__matches">
                  {games.map((g) => (
                    <MatchRow key={g.id} match={seasonGameAsMatch(g, division)} showDate />
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
