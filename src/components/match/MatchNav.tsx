'use client'

import { useEffect, useState } from 'react'

// The match page's sections as a row of tabs under the top: one tap to the statistics, the players or the
// line-ups on a phone. A plain list of links (the sections are all on the page, for readers and search
// engines alike); the one in view is marked while scrolling.

export function MatchNav({ items }: { items: { id: string; label: string }[] }) {
  const [active, setActive] = useState(items[0]?.id)
  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter((e): e is HTMLElement => !!e)
    if (!els.length || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      (entries) => {
        const seen = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (seen) setActive(seen.target.id)
      },
      { rootMargin: '-80px 0px -60% 0px' },
    )
    els.forEach((e) => io.observe(e))
    return () => io.disconnect()
  }, [items])
  if (items.length < 2) return null
  return (
    <nav className="mx-nav" aria-label="Kampsidens afsnit">
      {items.map((i) => (
        <a key={i.id} href={`#${i.id}`} className={i.id === active ? 'is-active' : undefined} aria-current={i.id === active ? 'location' : undefined}>
          {i.label}
        </a>
      ))}
    </nav>
  )
}
