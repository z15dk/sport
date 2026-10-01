'use client'

import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { AdCode } from './AdCode'

// The full-screen ad people scroll past (an "interscroller", placement `scroll` in
// src/data/ads.ts): a band the height of the screen across the page's whole width,
// whose picture is fixed to the screen and clipped to the band (clip-path), so the
// page slides over a still picture. The band leaves the column it sits in by the
// column's own distance to the screen's edge, measured in the browser.

// With several banners they take turns per visit: a visit (a browser tab) keeps its banner on
// every page, and the next visit shows the next one, so they share the visitors evenly. The page comes from the server with the first,
// and the turn is taken before the browser draws (the picture loads lazily, further down the page).

interface Item {
  desktop: string
  mobile?: string
  href?: string
  alt: string
  gambling: boolean
}

interface Props {
  items: Item[]
  mobileBelow: number
  code?: string
  gambling: { url: string; text: string }
}

const TURN_KEY = 'scrollAdTurn'

export function ScrollAd({ items, mobileBelow, code, gambling }: Props) {
  const outer = useRef<HTMLDivElement>(null)
  const [bleed, setBleed] = useState<CSSProperties>()
  const [turn, setTurn] = useState(0)
  useLayoutEffect(() => {
    if (items.length < 2) return
    let n: number
    try {
      // The same banner through a visit (this tab); the next visit gets the next one
      const seen = sessionStorage.getItem(TURN_KEY)
      if (seen !== null && Number.isFinite(Number(seen))) n = Number(seen)
      else {
        n = Number(localStorage.getItem(TURN_KEY) ?? -1) + 1
        if (!Number.isFinite(n) || n < 0) n = 0
        localStorage.setItem(TURN_KEY, String(n))
        sessionStorage.setItem(TURN_KEY, String(n))
      }
    } catch {
      // No storage (private window): one at random
      n = Math.floor(Math.random() * items.length)
    }
    setTurn(n % items.length) // eslint-disable-line react-hooks/set-state-in-effect -- the visit's own turn, before the browser draws
  }, [items.length])
  const item = items[turn % Math.max(1, items.length)]
  const { desktop, mobile, href, alt } = item ?? { alt: 'Annonce' }
  useLayoutEffect(() => {
    const el = outer.current
    if (!el) return
    const measure = () => {
      const left = el.getBoundingClientRect().left
      const width = document.documentElement.clientWidth
      setBleed((b) => (b?.marginLeft === -left && b?.width === width ? b : { marginLeft: -left, width }))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  const picture = desktop && (
    <picture>
      {mobile && <source media={`(max-width: ${mobileBelow}px)`} srcSet={mobile} />}
      {/* eslint-disable-next-line @next/next/no-img-element -- the advertiser's picture as it is */}
      <img key={desktop} src={desktop} alt={alt} loading="lazy" />
    </picture>
  )

  return (
    <div ref={outer} className="scroll-ad" role="complementary" aria-label="Annonce">
      <div className="scroll-ad__band" style={bleed}>
        <div className="scroll-ad__layer">
          {code ? <AdCode code={code} /> : href ? <a href={href} target="_blank" rel="sponsored nofollow noopener">{picture}</a> : picture}
        </div>
        <span className="scroll-ad__label">Annonce</span>
        <span className="scroll-ad__hint" aria-hidden="true">
          Scroll videre ↓
        </span>
        {item?.gambling && !code && (
          <a className="scroll-ad__rg" href={gambling.url} target="_blank" rel="noopener nofollow">
            {gambling.text}
          </a>
        )}
      </div>
    </div>
  )
}
