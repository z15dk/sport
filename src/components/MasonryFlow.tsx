'use client'

import { useRef, type ReactNode } from 'react'
import { useMasonry } from '../hooks/useMasonry'

// Boxes in two columns from 1000 px, each in the column that is shortest so far, so a short
// box (the table) never leaves a hole beside a long one (the coming matches). Before the
// browser has measured, CSS columns; below 1000 px one column in the page's order.
export function MasonryFlow({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useMasonry(ref, 2, '(min-width: 1000px)')
  return (
    <div ref={ref} className={`flow2 ${className}`}>
      {children}
    </div>
  )
}
