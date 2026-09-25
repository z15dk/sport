import Link from 'next/link'
import { ALL_SPORTS, SPORTS } from '../sports'
import { paths } from '../lib/site'
import type { SportFilter } from '../types'
import { SportIcon } from './SportIcon'

/** The sports as a row of tabs with icon and name, above the match list */
export function SportTabs({ active, className }: { active: SportFilter; className?: string }) {
  const tabs = [{ id: 'all' as const, slug: ALL_SPORTS.slug, label: 'Alle' }, ...SPORTS]
  return (
    <nav className={`sport-tabs${className ? ` ${className}` : ''}`} aria-label="Sportsgrene">
      {tabs.map((s) => (
        <Link
          key={s.id}
          href={paths.home({ sport: s.slug })}
          className={`sport-tab${s.id === active ? ' is-active' : ''}`}
          aria-current={s.id === active ? 'page' : undefined}
        >
          <SportIcon sport={s.id} size={18} />
          {s.label}
        </Link>
      ))}
    </nav>
  )
}
