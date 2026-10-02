'use client'

import { useEffect, useRef } from 'react'

/**
 * The end of a long match list: when it comes near the screen, the next rows are
 * drawn (the page's HTML and first paint carry only the first hundred). Also a
 * button, for readers who get there before the observer does.
 */
export function ListMore({ left, onMore }: { left: number; onMore: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const more = useRef(onMore)
  useEffect(() => {
    more.current = onMore
  }, [onMore])
  useEffect(() => {
    const el = ref.current
    if (!el || left <= 0 || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) more.current()
      },
      { rootMargin: '1200px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [left])
  if (left <= 0) return null
  return (
    <div ref={ref} className="more-rows">
      <button type="button" className="pill" onClick={onMore}>
        Vis flere kampe ({left.toLocaleString('da-DK')})
      </button>
    </div>
  )
}
