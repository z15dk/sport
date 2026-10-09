'use client'

import { useRef, type ReactNode } from 'react'
import { useMasonry } from '../hooks/useMasonry'

// The head-to-head page's boxes in the match page's flow: two columns, three on computers, each box in the
// shortest column (src/hooks/useMasonry.ts), one column on phones.
export function RivalryFlow({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useMasonry(ref)
  return (
    <div ref={ref} className="match-page__flow">
      {children}
    </div>
  )
}
