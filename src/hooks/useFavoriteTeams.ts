'use client'

import { useCallback, useEffect, useState } from 'react'

// The teams a visitor follows (club slugs), kept in the browser. Every
// component using this hook stays in step: a follow on a club page shows on
// the front page right away, also in other tabs.

const KEY = 'favoriteTeams'
const EVENT = 'scoreline:favorite-teams'

function read(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    const list = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function useFavoriteTeams() {
  const [teams, setTeams] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const sync = () => setTeams(read())
    sync()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read from the browser after hydration
    setLoaded(true)
    window.addEventListener(EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const toggle = useCallback((slug: string) => {
    const now = read()
    const next = now.includes(slug) ? now.filter((s) => s !== slug) : [...now, slug]
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      /* private mode: kept for this page only */
    }
    setTeams(next)
    window.dispatchEvent(new Event(EVENT))
  }, [])

  return { teams, loaded, toggle, follows: (slug: string) => teams.includes(slug) }
}
