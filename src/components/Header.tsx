'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { paths } from '../lib/site'

const NAV = [
  { href: '/', label: 'Kampe', match: (p: string) => p === '/' || p.startsWith('/kamp') },
  { href: paths.league('superliga'), label: 'Turneringer', match: (p: string) => p.startsWith('/turnering') },
  { href: paths.clubs(), label: 'Klubber', match: (p: string) => p.startsWith('/klub') },
]

export function Header() {
  const pathname = usePathname()
  return (
    <header className="header">
      <Link className="logo" href="/">
        Scoreline<span className="logo__dot">.</span>
      </Link>
      <nav className="nav" aria-label="Sider">
        {NAV.map((n) => {
          const active = n.match(pathname)
          return (
            <Link key={n.href} href={n.href} className={active ? 'is-active' : ''} aria-current={active ? 'page' : undefined}>
              {n.label}
            </Link>
          )
        })}
      </nav>
    </header>
  )
}
