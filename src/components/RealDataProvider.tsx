'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getRealData, setRealData, type RealData } from '../data/real'

const POLL_MS = 30_000

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
    const check = async () => {
      if (document.hidden) return
      try {
        const res = await fetch('/api/data-version', { cache: 'no-store' })
        const { version } = (await res.json()) as { version: string | null }
        if (version && version !== getRealData()?.version) router.refresh()
      } catch {
        // Offline or the server is restarting: try again next time
      }
    }
    const id = window.setInterval(check, POLL_MS)
    document.addEventListener('visibilitychange', check)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', check)
    }
  }, [router])
  return <>{children}</>
}
