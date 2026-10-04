'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ADMIN_MENU, adminSection, type AdminMenuItem } from '../lib/adminMenu'

// The admin bar (as in WordPress): a thin dark bar at the top of every page while
// logged in as admin. On the admin pages it is the admin's menu (every section,
// with its sub-pages as a dropdown); on the public pages today's visitors, "+ Ny",
// links to edit what this page shows, the sections and log out. Ordinary visitors never see it
// and never cost a request: only a browser with the flag cookie (set at login and
// by the admin pages) asks /api/admin/bar, which checks the real login.

const FLAG = 'scoreline_bar'
const hasFlag = () => typeof document !== 'undefined' && document.cookie.split('; ').some((c) => c === `${FLAG}=1`)

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

/** The current section's sub-pages as a row of tabs above the admin page's own content, for switching with one click */
export function AdminSubNav() {
  const path = usePathname() ?? '/'
  const { section, page } = adminSection(path)
  if (!section?.children) return null
  return (
    <nav className="admin-subnav" aria-label={section.label}>
      {groups(section.children).map((g) => (
        <span key={g.name ?? ''} className="admin-subnav__group">
          {g.name && <span className="admin-subnav__name">{g.name}</span>}
          {g.items.map((c) => (
            <Link key={c.href} href={c.href} className={`admin-subnav__link${c.href === page ? ' is-active' : ''}`} aria-current={c.href === page ? 'page' : undefined}>
              {c.label}
            </Link>
          ))}
        </span>
      ))}
    </nav>
  )
}

type Live = { visitors: { path: string; at: number; device: string; ref: string; views: number }[]; pages: { path: string; visitors: number }[] }

const ago = (t: number) => {
  const m = Math.floor((Date.now() - t) / 60_000)
  return m < 1 ? 'lige nu' : `${m} min.`
}
const pageName = (p: string) => (p === '/' ? 'Forsiden' : decodeURIComponent(p))

/** "N nu": opens who is on which page right now (the last 5 minutes), fresh every 15 seconds while open */
function LiveMenu({ now, today }: { now: number; today: number }) {
  const [open, setOpen] = useState(false)
  const [live, setLive] = useState<Live>()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    let stop = false
    const load = () =>
      fetch('/api/admin/bar?live=1', { cache: 'no-store' })
        .then((r) => r.json())
        .then((d: Live) => !stop && setLive(d))
        .catch(() => undefined)
    void load()
    const t = setInterval(load, 15_000)
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('click', close)
    return () => {
      stop = true
      clearInterval(t)
      document.removeEventListener('click', close)
    }
  }, [open])
  return (
    <div ref={ref} className={`adminbar__menu${open ? ' is-open' : ''}`}>
      <button type="button" className="adminbar__item" aria-expanded={open} title="Hvor de besøgende er lige nu" onClick={() => setOpen((o) => !o)}>
        <span className="adminbar__dot" aria-hidden />
        {live ? live.visitors.length : now} nu <span className="adminbar__muted">· {today.toLocaleString('da-DK')} i dag</span> <i className="adminbar__caret" aria-hidden />
      </button>
      {open && (
        <div className="adminbar__drop adminbar__live">
          {!live ? (
            <p className="adminbar__live-empty">Henter …</p>
          ) : !live.visitors.length ? (
            <p className="adminbar__live-empty">Ingen besøgende de sidste 5 minutter.</p>
          ) : (
            <>
              <span className="adminbar__group-name">Sider lige nu</span>
              {live.pages.slice(0, 12).map((p) => (
                <a key={p.path} href={p.path} target="_blank" rel="noreferrer" className="adminbar__live-row">
                  <span>{pageName(p.path)}</span>
                  <b>{p.visitors}</b>
                </a>
              ))}
              <span className="adminbar__group-name">Besøgende</span>
              {live.visitors.slice(0, 15).map((v, i) => (
                <div key={i} className="adminbar__live-row is-visitor">
                  <span>{pageName(v.path)}</span>
                  <small>
                    {ago(v.at)} · {v.device === 'mobil' ? 'mobil' : v.device === 'tablet' ? 'tablet' : 'computer'}
                    {v.ref ? ` · fra ${v.ref}` : ''}
                    {v.views > 1 ? ` · ${v.views} sider` : ''}
                  </small>
                </div>
              ))}
            </>
          )}
          <Link href="/admin/indstillinger" className="adminbar__live-all" onClick={() => setOpen(false)}>
            Alle besøgstal →
          </Link>
        </div>
      )}
    </div>
  )
}

/** A dropdown's items by their heading (one unnamed group when none has one) */
function groups(items: NonNullable<AdminMenuItem['children']>) {
  const out: { name?: string; items: typeof items }[] = []
  for (const c of items) {
    const last = out[out.length - 1]
    if (last && last.name === c.group) last.items.push(c)
    else out.push({ name: c.group, items: [c] })
  }
  return out
}

/** A dropdown; with `href` the label is a link to that page (the section's first page) and the caret beside it opens the menu */
function Menu({ label, children, active, href }: { label: React.ReactNode; children: React.ReactNode; active?: boolean; href?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [open])
  return (
    <div ref={ref} className={`adminbar__menu${open ? ' is-open' : ''}`} onPointerEnter={(e) => e.pointerType === 'mouse' && setOpen(true)} onPointerLeave={(e) => e.pointerType === 'mouse' && setOpen(false)}>
      {href ? (
        <span className={`adminbar__split${active ? ' is-active' : ''}`}>
          <Link href={href} className="adminbar__item" aria-current={active ? 'page' : undefined}>
            {label}
          </Link>
          <button type="button" className="adminbar__item adminbar__more" aria-expanded={open} aria-label="Vis undersider" onClick={() => setOpen((o) => !o)}>
            <i className="adminbar__caret" aria-hidden />
          </button>
        </span>
      ) : (
        <button type="button" className={`adminbar__item${active ? ' is-active' : ''}`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {label}
        </button>
      )}
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
    // On the admin pages always (only admins get past the login there), elsewhere only with the flag
    if (!onAdmin && !hasFlag()) return
    let alive = true
    fetch(`/api/admin/bar?sti=${encodeURIComponent(path)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<Bar>) : undefined))
      .then((b) => alive && setBar(b))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [path, onAdmin])

  if (!bar) return null
  const { section, page } = adminSection(path)
  const visitors = <LiveMenu key={`live${path}`} now={bar.now} today={bar.today} />
  const logout = (
    <form method="post" action="/api/admin/logout">
      <button className="adminbar__item" type="submit">
        Log ud
      </button>
    </form>
  )

  // One bar everywhere: every admin section with its dropdown, also over the public pages; there the
  // "Matchly" mark leads to the general dashboard, with "+ Ny" and the edit links for the page shown
  return (
    <div className="adminbar is-admin" role="navigation" aria-label="Admin">
      <div className="adminbar__in">
        {onAdmin ? (
          <Link className="adminbar__item" href="/" title="Gå til siden">
            <b className="adminbar__logo">M</b>
            <span className="adminbar__hide-s">Se siden</span>
          </Link>
        ) : (
          <Link className="adminbar__item" href="/admin/indstillinger" title="Admin: Generelt og besøgende">
            <b className="adminbar__logo">M</b>
            <span className="adminbar__hide-s">Matchly</span>
          </Link>
        )}
        <span className="adminbar__sep" aria-hidden />
        {ADMIN_MENU.map((s) =>
          s.children ? (
            <Menu key={`${s.href}${path}`} active={s === section} href={s.children[0].href} label={s.label}>
              {groups(s.children).map((g) => (
                <div key={g.name ?? ''} className="adminbar__group">
                  {g.name && <span className="adminbar__group-name">{g.name}</span>}
                  {g.items.map((c) => (
                    <Link key={c.href} href={c.href} className={c.href === page ? 'is-active' : undefined} aria-current={c.href === page ? 'page' : undefined}>
                      {c.label}
                    </Link>
                  ))}
                </div>
              ))}
            </Menu>
          ) : (
            <Link key={s.href} href={s.href} className={`adminbar__item${s === section ? ' is-active' : ''}`} aria-current={s === section ? 'page' : undefined}>
              {s.label}
            </Link>
          ),
        )}
        {!onAdmin &&
          bar.edit.map((e) => (
            <Link key={e.href + e.label} className="adminbar__item is-edit" href={e.href}>
              ✎ {e.label}
            </Link>
          ))}
        <span className="adminbar__space" />
        {visitors}
        <Menu key={`n${path}`} label={<>+ Ny</>}>
          <Link href="/admin/artikler/ny">Artikel</Link>
          <Link href="/admin/kanaler">TV-kanal eller regel</Link>
          <Link href="/admin/reklamer">Annonce</Link>
        </Menu>
        {logout}
      </div>
    </div>
  )
}
