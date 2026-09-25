import Link from 'next/link'
import { divisionBySlug, leagueGroups, sportOf } from '../data/leagues'
import { paths } from '../lib/site'
import { Flag } from './Flag'

/** League switcher for the active league's sport, one row per country */
export function DivisionTabs({ active }: { active: string }) {
  const current = divisionBySlug(active)
  const sport = current ? sportOf(current) : 'soccer'
  return (
    <nav className="division-tabs" aria-label="Række">
      {leagueGroups()
        .filter((g) => g.sport === sport)
        .map((g) => (
          <div key={g.country} className="filter-bar">
            <span className="division-tabs__country" title={g.country}>
              <Flag country={g.country} />
            </span>
            {g.divisions.map((d) => (
              <Link
                key={d.id}
                href={paths.league(d.slug)}
                className={`pill${d.slug === active ? ' is-active' : ''}`}
                aria-current={d.slug === active ? 'page' : undefined}
              >
                {d.name}
              </Link>
            ))}
          </div>
        ))}
    </nav>
  )
}
