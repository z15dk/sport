'use client'

import { useRef, useState } from 'react'

/**
 * A table whose rows past the first `step` come hidden from the server; the
 * button shows `step` more at a time.
 */
export function MoreRows({ step, total, children }: { step: number; total: number; children: React.ReactNode }) {
  const [shown, setShown] = useState(step)
  const box = useRef<HTMLDivElement>(null)
  const more = () => {
    const next = shown + step
    box.current?.querySelectorAll<HTMLElement>('tbody tr').forEach((tr, i) => {
      if (i < next) tr.hidden = false
    })
    setShown(next)
  }
  return (
    <div ref={box}>
      {children}
      {shown < total && (
        <div className="more-rows">
          <button type="button" className="pill" onClick={more}>
            Vis flere kampe
          </button>
        </div>
      )}
    </div>
  )
}
