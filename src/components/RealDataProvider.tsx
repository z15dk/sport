'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getRealData, setRealData, type RealData } from '../data/real'

const POLL_MS = 15_000
/** New data is fetched within this long of being seen, at a random moment */
const SPREAD_MS = 25_000
/** And at most this often per page */
const MIN_GAP_MS = 30_000

/**
 * Hands the server's real fixtures to the browser before any match list renders,
 * so server and browser build the same season. While the page is open it asks
 * the server every 30 seconds whether the data has changed (new scores, goals,
 * cards) and then refreshes the page's data without a reload.
 */
export function RealDataProvider({ data, children }: { data?: RealData; children: React.ReactNode }) {
  setRealData(data)
  const router = useRouter()
  useEffect(() => {
    // New data reaches every open page at the same moment: each page waits a random bit before it asks for the new
    // page, so the server gets them spread over half a minute instead of all at once (which froze it for everyone)
    let pending: number | undefined
    let lastRefresh = 0
    const check = async () => {
      if (document.hidden || pending !== undefined) return
      try {
        const res = await fetch('/api/data-version', { cache: 'no-store' })
        const { version } = (await res.json()) as { version: string | null }
        if (!version || version === getRealData()?.version) return
        const wait = Math.max(0, lastRefresh + MIN_GAP_MS - Date.now()) + Math.random() * SPREAD_MS
        pending = window.setTimeout(() => {
          pending = undefined
          lastRefresh = Date.now()
          if (!document.hidden) router.refresh()
        }, wait)
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
