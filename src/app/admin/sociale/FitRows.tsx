'use client'

import { useLayoutEffect } from 'react'

// A card shows only the rows that fit whole: in every [data-fit] box, table
// rows that would be cut by the box's bottom edge (above the Matchly bar) are
// hidden instead of being cut in half. Runs again when the page is resized.

function fit(box: HTMLElement) {
  // Table rows, and blocks marked [data-fit-item] (shown whole or not at all)
  const rows = [...box.querySelectorAll<HTMLElement>('tr, [data-fit-item]')]
  rows.forEach((r) => (r.style.display = ''))
  const bottom = box.getBoundingClientRect().bottom
  for (const r of rows) if (r.getBoundingClientRect().bottom > bottom + 0.5) r.style.display = 'none'
}

export function FitRows() {
  useLayoutEffect(() => {
    const boxes = [...document.querySelectorAll<HTMLElement>('[data-fit]')]
    const all = () => boxes.forEach(fit)
    all()
    // Again once the web fonts are in (they change the line heights)
    document.fonts?.ready.then(all)
    const observer = new ResizeObserver(all)
    boxes.forEach((b) => observer.observe(b))
    return () => observer.disconnect()
  }, [])
  return null
}
