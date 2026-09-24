import Link from 'next/link'
import { DIVISIONS } from '../data/danishClubs'
import { paths } from '../lib/site'

export function DivisionTabs({ active }: { active: string }) {
  return (
    <nav className="filter-bar" aria-label="Række">
      {DIVISIONS.map((d) => (
        <Link
          key={d.id}
          href={paths.league(d.slug)}
          className={`pill${d.slug === active ? ' is-active' : ''}`}
          aria-current={d.slug === active ? 'page' : undefined}
        >
          {d.name}
        </Link>
      ))}
    </nav>
  )
}
