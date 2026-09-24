'use client'

import { useEffect, useState } from 'react'

/** Current time in ms, starting from `initial` (set by the server) and updated every `intervalMs`. */
export function useNow(intervalMs: number, initial: number) {
  const [now, setNow] = useState(initial)
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const first = window.setTimeout(tick, 0)
    const id = window.setInterval(tick, intervalMs)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(id)
    }
  }, [intervalMs])
  return now
}
