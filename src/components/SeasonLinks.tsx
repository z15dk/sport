import Link from 'next/link'
import type { PastSeason } from '../lib/history'
import { paths } from '../lib/site'

/** Links to a league's earlier seasons (also on the league's own page) */
export function SeasonLinks({ divisionSlug, seasons, current }: { divisionSlug: string; seasons: PastSeason[]; current?: string }) {
  return (
    <ul className="season-links">
      {seasons.map((s) => (
        <li key={s.slug}>
          {s.slug === current ? (
            <strong>{s.label}</strong>
          ) : (
            <Link href={`${paths.league(divisionSlug)}/${s.slug}`}>
              {s.label}
              <em>{s.table[0]?.name}</em>
            </Link>
          )}
        </li>
      ))}
    </ul>
  )
}
