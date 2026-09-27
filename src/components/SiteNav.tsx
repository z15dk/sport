'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { shownDivisions, sportOf } from '../data/leagues'
import { getRealData } from '../data/real'
import { getMatches } from '../data/matches'
import { teamBySlug } from '../data/teams'
import { externalLeagueKey } from '../data/external'
import { wholeSeason } from '../data/cups'
import { danishCountry } from '../data/countries'
import { useFavoriteTeams } from '../hooks/useFavoriteTeams'
import { useNow } from '../hooks/useNow'
import { isoDate } from '../lib/time'
import { paths } from '../lib/site'
import { sportById } from '../sports'
import { Flag } from './Flag'
import { SportIcon } from './SportIcon'
import { TeamBadge } from './TeamBadge'
import { SearchSuggestions } from './SearchSuggestions'
import type { SportId } from '../types'

// The site's navigation: a top bar (logo, search, tournaments, live, my teams)
// and, on phones, a bar at the bottom like an app's, whose buttons open a
// panel from below.

type Panel = 'search' | 'tournaments' | 'teams'

/** The number of matches being played right now, all sports */
function useLiveCount() {
  const now = useNow(30_000, Date.now())
  const version = getRealData()?.version
  return useMemo(() => getMatches(isoDate(now), 'all', now).filter((m) => m.state === 'live').length, [now, version]) // eslint-disable-line react-hooks/exhaustive-deps
}

/** Our leagues by sport, and the cups and whole-season tournaments (Champions League) */
function TournamentList({ onPick }: { onPick: () => void }) {
  const version = getRealData()?.version
  const groups = useMemo(() => {
    const bySport = new Map<SportId, { href: string; name: string; country?: string }[]>()
    for (const d of shownDivisions()) {
      const s = sportOf(d)
      bySport.set(s, [...(bySport.get(s) ?? []), { href: paths.league(d.slug), name: d.name, country: d.country }])
    }
    const seen = new Set<string>()
    for (const g of getRealData()?.external ?? []) {
      if (!wholeSeason(g)) continue
      const key = externalLeagueKey(g.league)
      if (seen.has(key)) continue
      seen.add(key)
      bySport.set(g.sport, [...(bySport.get(g.sport) ?? []), { href: paths.league(key), name: g.league.name, country: danishCountry(g.league.country) }])
    }
    return [...bySport.entries()]
  }, [version]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="nav-menu__cols">
      {groups.map(([sport, list]) => (
        <div key={sport} className="nav-menu__col">
          <h3>
            <SportIcon sport={sport} size={16} /> {sportById(sport).label}
          </h3>
          <ul>
            {list.map((l) => (
              <li key={l.href}>
                <Link href={l.href} onClick={onPick}>
                  <Flag country={l.country} /> {l.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div className="nav-menu__col">
        <h3>Klubber</h3>
        <ul>
          <li>
            <Link href={paths.clubs()} onClick={onPick}>
              Alle klubber →
            </Link>
          </li>
        </ul>
      </div>
    </div>
  )
}

function MyTeamsList({ onPick }: { onPick: () => void }) {
  const { teams, loaded } = useFavoriteTeams()
  if (!loaded) return null
  const list = teams.map((slug) => teamBySlug(slug)).filter((t) => !!t)
  if (!list.length) {
    return (
      <p className="nav-menu__empty">
        Du følger ingen hold endnu. Tryk <strong>☆ Følg</strong> på en klubside, så får holdet et kort øverst på forsiden.{' '}
        <Link href={paths.clubs()} onClick={onPick}>
          Find din klub →
        </Link>
      </p>
    )
  }
  return (
    <ul className="nav-menu__teams">
      {list.map((t) => (
        <li key={t.slug}>
          <Link href={paths.club(t.slug)} onClick={onPick}>
            <TeamBadge link={false} name={t.name} src={t.logo} colors={t.colors ?? t.season?.club.colors} size={28} />
            <span>
              <strong>{t.name}</strong>
              <em>{t.league}</em>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function SearchBox({ autoFocus, onPick }: { autoFocus?: boolean; onPick: () => void }) {
  const [query, setQuery] = useState('')
  return (
    <label className="search nav-search">
      <span className="visually-hidden">Søg efter klub eller turnering</span>
      <svg viewBox="0 0 24 24" aria-hidden className="search__icon">
        <path d="M10.5 3a7.5 7.5 0 015.96 12.06l4.24 4.24-1.4 1.4-4.24-4.24A7.5 7.5 0 1110.5 3zm0 2a5.5 5.5 0 100 11 5.5 5.5 0 000-11z" />
      </svg>
      <input type="search" placeholder="Søg klub eller turnering" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus={autoFocus} autoComplete="off" />
      {query.trim().length >= 2 && (
        <SearchSuggestions
          query={query}
          onPick={() => {
            setQuery('')
            onPick()
          }}
        />
      )}
    </label>
  )
}

export function SiteNav() {
  const pathname = usePathname()
  const live = useLiveCount()
  const [open, setOpen] = useState<Panel>()
  const ref = useRef<HTMLDivElement>(null)
  const close = () => setOpen(undefined)

  // Closed by a click elsewhere, Escape or a new page
  useEffect(() => {
    if (!open) return
    const click = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(undefined)
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(undefined)
    document.addEventListener('mousedown', click)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('mousedown', click)
      document.removeEventListener('keydown', key)
    }
  }, [open])
  // A new page closes the menus
  const [page, setPage] = useState(pathname)
  if (page !== pathname) {
    setPage(pathname)
    setOpen(undefined)
  }

  const toggle = (p: Panel) => setOpen((o) => (o === p ? undefined : p))
  const onHome = pathname === '/'

  return (
    <div ref={ref} className="site-nav">
      <header className="topbar">
        <Link className="logo" href="/">
          Matchly<span className="logo__dot">.</span>
        </Link>
        <div className="topbar__search">
          <SearchBox onPick={close} />
        </div>
        <nav className="topbar__nav" aria-label="Hovedmenu">
          <button type="button" className={`topbar__btn${open === 'tournaments' ? ' is-open' : ''}`} aria-expanded={open === 'tournaments'} onClick={() => toggle('tournaments')}>
            <Icon name="trophy" /> Turneringer
          </button>
          <Link className={`topbar__btn topbar__live${live ? ' has-live' : ''}`} href="/?live=1">
            <span className="live-dot" aria-hidden /> Live {live > 0 && <span className="topbar__count">{live}</span>}
          </Link>
          <button type="button" className={`topbar__btn${open === 'teams' ? ' is-open' : ''}`} aria-expanded={open === 'teams'} onClick={() => toggle('teams')}>
            <Icon name="star" /> Mine hold
          </button>
        </nav>
        {(open === 'tournaments' || open === 'teams') && (
          <div className="nav-menu nav-menu--drop" role="dialog" aria-label={open === 'teams' ? 'Mine hold' : 'Turneringer'}>
            {open === 'teams' ? <MyTeamsList onPick={close} /> : <TournamentList onPick={close} />}
          </div>
        )}
      </header>

      {/* Phones: the app bar at the bottom, its panels open from below */}
      {open && (
        <div className="sheet-backdrop" onClick={close}>
          <div className="nav-sheet" role="dialog" aria-label={open === 'search' ? 'Søg' : open === 'teams' ? 'Mine hold' : 'Turneringer'} onClick={(e) => e.stopPropagation()}>
            {open === 'search' && <SearchBox autoFocus onPick={close} />}
            {open === 'tournaments' && <TournamentList onPick={close} />}
            {open === 'teams' && <MyTeamsList onPick={close} />}
          </div>
        </div>
      )}
      <nav className="bottombar" aria-label="Menu">
        <Link href="/" className={onHome && !open ? 'is-active' : ''} onClick={close}>
          <span className="bottombar__icon">
            <Icon name="today" />
          </span>
          I dag
        </Link>
        <Link href="/?live=1" onClick={close}>
          <span className="bottombar__icon bottombar__live">
            <span className="live-dot" />
            {live > 0 && <b>{live}</b>}
          </span>
          Live
        </Link>
        <button type="button" className={open === 'search' ? 'is-active' : ''} onClick={() => toggle('search')}>
          <span className="bottombar__icon">
            <Icon name="search" />
          </span>
          Søg
        </button>
        <button type="button" className={open === 'tournaments' ? 'is-active' : ''} onClick={() => toggle('tournaments')}>
          <span className="bottombar__icon">
            <Icon name="trophy" />
          </span>
          Turneringer
        </button>
        <button type="button" className={open === 'teams' ? 'is-active' : ''} onClick={() => toggle('teams')}>
          <span className="bottombar__icon">
            <Icon name="star" />
          </span>
          Mine hold
        </button>
      </nav>
    </div>
  )
}

/** The bottom bar's line icons, drawn in the text colour */
function Icon({ name }: { name: 'today' | 'search' | 'trophy' | 'star' }) {
  const paths = {
    today: (
      <>
        <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
        <path d="M3.5 10h17M8 3v4M16 3v4" />
        <circle cx="12" cy="15" r="1.6" fill="currentColor" stroke="none" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="6.5" />
        <path d="m16 16 4.5 4.5" />
      </>
    ),
    trophy: (
      <>
        <path d="M7.5 4h9v5a4.5 4.5 0 0 1-9 0V4Z" />
        <path d="M7.5 6H4.5v1.5A3 3 0 0 0 7.8 10.5M16.5 6h3v1.5a3 3 0 0 1-3.3 3M12 13.5V17M8.5 20.5h7M9.5 17h5v3.5h-5z" />
      </>
    ),
    star: <path d="m12 3.8 2.5 5.2 5.6.8-4.1 3.9 1 5.6-5-2.7-5 2.7 1-5.6-4.1-3.9 5.6-.8L12 3.8Z" />,
  }
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {paths[name]}
    </svg>
  )
}
