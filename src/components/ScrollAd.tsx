'use client'

import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { AdCode } from './AdCode'

// The full-screen ad people scroll past (an "interscroller", placement `scroll` in
// src/data/ads.ts): a band the height of the screen across the page's whole width,
// whose picture is fixed to the screen and clipped to the band (clip-path), so the
// page slides over a still picture. The band leaves the column it sits in by the
// column's own distance to the screen's edge, measured in the browser.

interface Props {
  desktop?: string
  mobile?: string
  mobileBelow: number
  href?: string
  alt: string
  code?: string
  gambling?: { url: string; text: string }
}

export function ScrollAd({ desktop, mobile, mobileBelow, href, alt, code, gambling }: Props) {
  const outer = useRef<HTMLDivElement>(null)
  const [bleed, setBleed] = useState<CSSProperties>()
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
      <img src={desktop} alt={alt} loading="lazy" />
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
        {gambling && (
          <a className="scroll-ad__rg" href={gambling.url} target="_blank" rel="noopener nofollow">
            {gambling.text}
          </a>
        )}
      </div>
    </div>
  )
}
