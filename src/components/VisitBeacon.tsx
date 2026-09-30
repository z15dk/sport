'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

// Tells our own visitor statistics (src/lib/visits.ts, /api/hit) that a page
// was seen: on the first page and on every page after it. No cookies, nothing
// saved in the browser; where the visitor came from only on the first page.
export function VisitBeacon() {
  const path = usePathname()
  const first = useRef(true)
  useEffect(() => {
    if (!path) return
    const body = JSON.stringify({ p: path, r: first.current ? document.referrer : '' })
    first.current = false
    try {
      if (!navigator.sendBeacon?.('/api/hit', new Blob([body], { type: 'application/json' }))) {
        void fetch('/api/hit', { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: true }).catch(() => undefined)
      }
    } catch {
      // Statistics are never worth an error
    }
  }, [path])
  return null
}
