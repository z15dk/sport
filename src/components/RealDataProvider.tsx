'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { pageRefreshWanted, patchRealData, setRealData, type RealData } from '../data/real'
import type { ExternalGame } from '../data/external'

const POLL_MS = 15_000
/** A new page is fetched within this long of being needed, at a random moment */
const SPREAD_MS = 25_000
/** And at most this often per page */
const MIN_GAP_MS = 60_000

interface LiveAnswer {
  cursor: string
  version: string | null
  refresh?: boolean
  games: ExternalGame[]
}

/**
 * Hands the server's real fixtures to the browser before any match list
 * renders, so server and browser build the same season. While the page is
 * open it asks every 15 seconds what has changed (/api/live, src/lib/liveFeed.ts)
 * and puts the changed games straight into its data – the page updates without
 * asking the server for a new page. A new page is fetched only when more than
 * the games changed (our leagues' fixtures, names, channels, settings), or now
 * and then on a live match's page (its statistics come from the server); then
 * at a random moment within 25 seconds, so open pages don't all come at once.
 */
export function RealDataProvider({ data, cursor, children }: { data?: RealData; cursor?: string; children: React.ReactNode }) {
  // In the browser only: the server already has all the data (the page's share must never replace it there)
  if (typeof window !== 'undefined') setRealData(data)
  const router = useRouter()
  // Where to ask from: the page's own cursor, new with every page from the server
  const at = useRef(cursor)
  useEffect(() => {
    at.current = cursor
  }, [cursor])
  useEffect(() => {
    let pending: number | undefined
    let lastRefresh = Date.now()
    const refreshSoon = () => {
      if (pending !== undefined) return
      const wait = Math.max(0, lastRefresh + MIN_GAP_MS - Date.now()) + Math.random() * SPREAD_MS
      pending = window.setTimeout(() => {
        pending = undefined
        lastRefresh = Date.now()
        if (!document.hidden) router.refresh()
      }, wait)
    }
    const check = async () => {
      if (document.hidden || !at.current) return
      try {
        const res = await fetch(`/api/live?siden=${encodeURIComponent(at.current)}`, { cache: 'no-store' })
        if (!res.ok) return
        const answer = (await res.json()) as LiveAnswer
        at.current = answer.cursor
        if (answer.games.length) {
          patchRealData(answer.games, answer.version)
          if (pageRefreshWanted()) refreshSoon()
        }
        if (answer.refresh) refreshSoon()
      } catch {
        // Offline or the server is restarting: try again next time
      }
    }
    const id = window.setInterval(check, POLL_MS)
    document.addEventListener('visibilitychange', check)
    return () => {
      window.clearInterval(id)
      if (pending !== undefined) window.clearTimeout(pending)
      document.removeEventListener('visibilitychange', check)
    }
  }, [router])
  return <>{children}</>
}
