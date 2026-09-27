'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { SearchHit } from '../lib/search'
import { TeamBadge } from './TeamBadge'

type Hits = { clubs: SearchHit[]; leagues: SearchHit[] }
const EMPTY: Hits = { clubs: [], leagues: [] }

/** Clubs and tournaments whose name (or short name, like "FCK") matches the search, linking to their pages (found on the server) */
export function SearchSuggestions({ query, onPick }: { query: string; onPick: () => void }) {
  const [hits, setHits] = useState<Hits>(EMPTY)
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setHits(EMPTY) // eslint-disable-line react-hooks/set-state-in-effect -- cleared as the query gets too short
      return
    }
    const ctrl = new AbortController()
    // A short pause, so typing a name asks once
    const t = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        if (res.ok) setHits((await res.json()) as Hits)
      } catch {
        // Aborted by the next keystroke, or offline
      }
    }, 120)
    return () => {
      window.clearTimeout(t)
      ctrl.abort()
    }
  }, [query])

  if (!hits.clubs.length && !hits.leagues.length) return null
  return (
    <div className="search-hits" role="listbox" aria-label="Forslag">
      {([['Klubber', hits.clubs], ['Turneringer', hits.leagues]] as const).map(([title, list]) =>
        list.length ? (
          <div key={title} className="search-hits__group">
            <span className="search-hits__title">{title}</span>
            {list.map((h) => (
              <Link key={h.href} href={h.href} className="search-hits__item" role="option" aria-selected={false} onClick={onPick}>
                <TeamBadge link={false} name={h.name} src={h.logo} colors={h.colors} size={26} />
                <span>
                  <strong>{h.name}</strong>
                  <em>{h.sub}</em>
                </span>
              </Link>
            ))}
          </div>
        ) : null,
      )}
    </div>
  )
}
