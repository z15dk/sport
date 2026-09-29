'use client'

import { useEffect, useState } from 'react'
import { onRealDataPatch } from '../data/real'

/**
 * Current time in ms, starting from `initial` (set by the server) and updated
 * every `intervalMs` – and when live changes arrive, so what shows matches
 * (and uses this) shows them at once.
 */
export function useNow(intervalMs: number, initial: number) {
  const [now, setNow] = useState(initial)
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const first = window.setTimeout(tick, 0)
    const id = window.setInterval(tick, intervalMs)
    const off = onRealDataPatch(tick)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(id)
      off()
    }
  }, [intervalMs])
  return now
}
