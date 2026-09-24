'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { SPORTS } from '../sports'
import { paths } from '../lib/site'
import { SportIcon } from './SportIcon'

export function SportRail() {
  const pathname = usePathname()
  const params = useSearchParams()
  const active = pathname === '/' ? (params.get('sport') ?? 'fodbold') : undefined

  return (
    <nav className="rail" aria-label="Sportsgrene">
      <Link className="rail__logo" href="/" aria-label="Scoreline forside">
        S<span>.</span>
      </Link>
      <div className="rail__items">
        {SPORTS.map((s) => (
          <Link
            key={s.id}
            href={paths.home({ sport: s.slug })}
            className={`rail__item${s.slug === active ? ' is-active' : ''}`}
            aria-current={s.slug === active ? 'page' : undefined}
            title={s.label}
          >
            <SportIcon sport={s.id} />
            <span className="rail__label">{s.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  )
}
