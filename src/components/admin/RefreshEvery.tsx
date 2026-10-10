'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

/** Reads the page again from the server every few seconds while it is open and seen (James' status) */
export function RefreshEvery({ seconds }: { seconds: number }) {
  const router = useRouter()
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh()
    }, seconds * 1000)
    return () => clearInterval(t)
  }, [router, seconds])
  return null
}
