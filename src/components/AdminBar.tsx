'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

// The admin bar (as in WordPress): a thin dark bar at the top of the public pages
// while logged in as admin – today's visitors, "+ Ny", links to edit what this
// page shows, the admin's sections and log out. Ordinary visitors never see it
// and never cost a request: only a browser with the flag cookie (set at login and
// by the admin pages) asks /api/admin/bar, which checks the real login.

const FLAG = 'scoreline_bar'
const hasFlag = () => typeof document !== 'undefined' && document.cookie.split('; ').some((c) => c === `${FLAG}=1`)

const SECTIONS = [
  { href: '/admin/besoegende', label: 'Besøgende' },
  { href: '/admin/artikler', label: 'Artikler' },
  { href: '/admin/klubber', label: 'Klubber' },
  { href: '/admin/ligaer', label: 'Ligaer' },
  { href: '/admin/kanaler', label: 'Kanaler' },
  { href: '/admin/billetter', label: 'Billetter' },
  { href: '/admin/kvindesport', label: 'Kvindesport' },
  { href: '/admin/reklamer', label: 'Reklamer' },
  { href: '/admin/sociale', label: 'Sociale medier' },
  { href: '/admin/billeder', label: 'Billeder' },
  { href: '/admin/data', label: 'Data & API' },
  { href: '/admin/indstillinger', label: 'Indstillinger' },
]

interface Bar {
  now: number
  today: number
  edit: { label: string; href: string }[]
}

/** On the admin pages: makes sure the browser has the flag (also for logins from before the bar existed) */
export function AdminBarFlag() {
  useEffect(() => {
    if (!hasFlag()) document.cookie = `${FLAG}=1; path=/; max-age=${7 * 24 * 3600}; samesite=lax${location.protocol === 'https:' ? '; secure' : ''}`
  }, [])
  return null
}

function Menu({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [open])
  return (
    <div ref={ref} className={`adminbar__menu${open ? ' is-open' : ''}`} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" className="adminbar__item" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {label}
      </button>
      {open && (
        <div className="adminbar__drop" onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  )
}

export function AdminBar() {
  const path = usePathname() ?? '/'
  const [bar, setBar] = useState<Bar>()
  const onAdmin = path.startsWith('/admin')

  useEffect(() => {
    if (onAdmin || !hasFlag()) return
    let alive = true
    fetch(`/api/admin/bar?sti=${encodeURIComponent(path)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<Bar>) : undefined))
      .then((b) => alive && setBar(b))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [path, onAdmin])

  if (onAdmin || !bar) return null
  return (
    <div className="adminbar" role="navigation" aria-label="Admin">
      <div className="adminbar__in">
        <Menu
          key={`a${path}`}
          label={
            <>
              <b className="adminbar__logo">M</b>
              <span className="adminbar__hide-s">Matchly</span>
            </>
          }
        >
          <Link href="/admin/indstillinger">Admin</Link>
          {SECTIONS.map((s) => (
            <Link key={s.href} href={s.href}>
              {s.label}
            </Link>
          ))}
        </Menu>
        <Link className="adminbar__item" href="/admin/besoegende" title="Besøgende i dag og lige nu">
          <span className="adminbar__dot" aria-hidden />
          {bar.now} nu <span className="adminbar__muted">· {bar.today.toLocaleString('da-DK')} i dag</span>
        </Link>
        <Menu key={`n${path}`} label={<>+ Ny</>}>
          <Link href="/admin/artikler/ny">Artikel</Link>
          <Link href="/admin/kanaler">TV-kanal eller regel</Link>
          <Link href="/admin/reklamer">Annonce</Link>
        </Menu>
        {bar.edit.map((e) => (
          <Link key={e.href + e.label} className="adminbar__item is-edit" href={e.href}>
            ✎ {e.label}
          </Link>
        ))}
        <span className="adminbar__space" />
        <Link className="adminbar__item adminbar__hide-s" href="/admin/data">
          Data
        </Link>
        <form method="post" action="/api/admin/logout">
          <button className="adminbar__item" type="submit">
            Log ud
          </button>
        </form>
      </div>
    </div>
  )
}
