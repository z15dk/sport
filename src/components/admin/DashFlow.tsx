'use client'

import { useRef, type ReactNode } from 'react'
import { useMasonry } from '../../hooks/useMasonry'

// The admin dashboard's cards in three columns from 1200 px, each card in the column that is
// shortest so far, so no column is left empty beside a long one (src/hooks/useMasonry.ts).
// Before the browser has measured, CSS columns; narrower screens two columns, then one.
export function DashFlow({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useMasonry(ref, 3, '(min-width: 1200px)')
  return (
    <div ref={ref} className="dash-flow">
      {children}
    </div>
  )
}
