'use client'

import { useEffect, useRef, useState } from 'react'

/** The hero's live table in a browser window: the real widget, changing league every few seconds */
export function WidgetShowcase({ leagues }: { leagues: { slug: string; name: string }[] }) {
  const [i, setI] = useState(0)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (leagues.length < 2 || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = setInterval(() => {
      setShown(false)
      setTimeout(() => setI((n) => (n + 1) % leagues.length), 350)
    }, 6000)
    return () => clearInterval(t)
  }, [leagues.length])
  const frame = useRef<HTMLIFrameElement>(null)
  // The first table may have loaded before the page was ready to hear it: shown anyway after a moment
  useEffect(() => {
    if (frame.current?.contentDocument?.readyState === 'complete') setShown(true)
    const t = setTimeout(() => setShown(true), 900)
    return () => clearTimeout(t)
  }, [i])
  const league = leagues[i]
  if (!league) return null
  return (
    <div className="wg-window" aria-label="Eksempel på tabellen">
      <div className="wg-window__body">
        <iframe
          key={league.slug}
          ref={frame}
          src={`/widget/tabel/${league.slug}?kompakt=1`}
          title={`${league.name} stilling`}
          className={shown ? 'is-shown' : undefined}
          onLoad={() => setShown(true)}
          tabIndex={-1}
        />
      </div>
      <div className="wg-window__dots" aria-hidden>
        {leagues.map((l, k) => (
          <button key={l.slug} type="button" className={k === i ? 'is-on' : undefined} onClick={() => setI(k)} tabIndex={-1} />
        ))}
      </div>
    </div>
  )
}
