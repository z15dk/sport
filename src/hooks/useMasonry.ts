'use client'

import { useLayoutEffect, type RefObject } from 'react'

// The match page's boxes in three columns on computers, each box in the column
// that is shortest so far (in their order), so no column is left nearly empty
// beside long boxes. CSS columns place them in order and can't, since a box is
// never split. The boxes are a flex column that wraps (`.is-masonry`): each
// box's `order` is its column, two breaks (::before/::after) end the first two
// columns, and the container is as tall as the tallest column. Below the width
// (and before the browser has measured) the CSS columns of the server's page stay.

const WIDE = '(min-width: 1240px)'
const GAP = 16

/** The boxes: the flow's descendants that take part in its layout (wrappers with display: contents are looked through) */
function boxesOf(el: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = []
  const walk = (parent: Element) => {
    for (const child of Array.from(parent.children)) {
      if (!(child instanceof HTMLElement)) continue
      const display = getComputedStyle(child).display
      if (display === 'contents') walk(child)
      else if (display !== 'none') out.push(child)
    }
  }
  walk(el)
  return out
}

export function useMasonry(ref: RefObject<HTMLElement | null>, columns = 3, wide = WIDE) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || typeof window === 'undefined' || !window.matchMedia) return
    const media = window.matchMedia(wide)
    let frame = 0
    let watched: HTMLElement[] = []
    const clear = () => {
      el.classList.remove('is-masonry')
      el.style.height = ''
      for (const b of boxesOf(el)) {
        b.style.order = ''
        b.classList.remove('is-colend')
      }
    }
    const layout = () => {
      frame = 0
      if (!media.matches) return clear()
      const boxes = boxesOf(el)
      const heights = Array(columns).fill(0) as number[]
      // The last box of each column is marked (a flow can let it grow, so the columns end level, see .flow2 in
      // globals.css); the boxes are measured without the mark, at their own height
      for (const b of boxes) b.classList.remove('is-colend')
      const last: (HTMLElement | undefined)[] = Array(columns).fill(undefined)
      for (const b of boxes) {
        const h = b.getBoundingClientRect().height + GAP
        let c = 0
        for (let i = 1; i < columns; i++) if (heights[i] < heights[c] - 1) c = i
        // Each column's boxes in their own order; the breaks between the columns have the even orders
        const order = String(c * 2 + 1)
        if (b.style.order !== order) b.style.order = order
        heights[c] += h
        last[c] = b
      }
      for (const b of last) b?.classList.add('is-colend')
      const height = `${Math.ceil(Math.max(...heights)) + 4}px`
      if (el.style.height !== height) el.style.height = height
      el.classList.add('is-masonry')
      // Watch the boxes for changes in height (live statistics, pictures loading)
      for (const b of boxes) if (!watched.includes(b)) ro.observe(b)
      watched = boxes
    }
    const soon = () => {
      if (!frame) frame = requestAnimationFrame(layout)
    }
    const ro = new ResizeObserver(soon)
    layout()
    media.addEventListener('change', soon)
    window.addEventListener('resize', soon)
    // New boxes (the page's data changes)
    const mo = new MutationObserver(soon)
    mo.observe(el, { childList: true, subtree: true })
    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
      mo.disconnect()
      media.removeEventListener('change', soon)
      window.removeEventListener('resize', soon)
      clear()
    }
  }, [ref, columns, wide])
}
