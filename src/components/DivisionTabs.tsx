import Link from 'next/link'
import { COUNTRIES, DIVISIONS } from '../data/leagues'
import { paths } from '../lib/site'
import { Flag } from './Flag'

/** League switcher, one row per country */
export function DivisionTabs({ active }: { active: string }) {
  return (
    <nav className="division-tabs" aria-label="Række">
      {COUNTRIES.map((country) => (
        <div key={country} className="filter-bar">
          <span className="division-tabs__country" title={country}>
            <Flag country={country} />
          </span>
          {DIVISIONS.filter((d) => d.country === country).map((d) => (
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
