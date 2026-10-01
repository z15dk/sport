'use client'

import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { AdCode } from './AdCode'
import type { AdBanner } from '../data/ads'

// The full-screen ad people scroll past (an "interscroller", placement `scroll` in
// src/data/ads.ts): a band the height of the screen across the page's whole width,
// whose picture is fixed to the screen and clipped to the band (clip-path), so the
// page slides over a still picture. The band leaves the column it sits in by the
// column's own distance to the screen's edge, measured in the browser.
//
// With several banners (advertisers sharing the placement) every one is in the page and the
// visit's turn shows one of them before the page is drawn (`.ad-rot`, src/data/ads.ts):
// the same banner all through a visit, the next one at the next visit.

interface Props {
  banners: AdBanner[]
  mobileBelow: number
  gambling: { url: string; text: string }
}

export function ScrollAd({ banners, mobileBelow, gambling }: Props) {
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

  const rotating = banners.length > 1
  const rot = rotating ? ` ad-rot ad-rot--${banners.length}` : ''
  const at = (i: number) => (rotating ? i : undefined)

  return (
    <div ref={outer} className="scroll-ad" role="complementary" aria-label="Annonce">
      <div className="scroll-ad__band" style={bleed}>
        <div className={`scroll-ad__layer${rot}`}>
          {banners.map((b, i) => {
            if (b.kind === 'code' && b.code) return <AdCode key={i} code={b.code} turn={at(i)} />
            if (!b.desktop) return null
            const picture = (
              <picture key={i} data-ad-i={b.href ? undefined : at(i)}>
                {b.mobile && <source media={`(max-width: ${mobileBelow}px)`} srcSet={b.mobile} />}
                {/* eslint-disable-next-line @next/next/no-img-element -- the advertiser's picture as it is */}
                <img src={b.desktop} alt={b.alt ?? 'Annonce'} loading="lazy" />
              </picture>
            )
            return b.href ? (
              <a key={i} data-ad-i={at(i)} href={b.href} target="_blank" rel="sponsored nofollow noopener">
                {picture}
              </a>
            ) : (
              picture
            )
          })}
        </div>
        <span className="scroll-ad__label">Annonce</span>
        <span className="scroll-ad__hint" aria-hidden="true">
          Scroll videre ↓
        </span>
        {banners.some((b) => b.gambling) && (
          <div className={rot.trim() || undefined}>
            {banners.map((b, i) =>
              b.gambling ? (
                <a key={i} data-ad-i={at(i)} className="scroll-ad__rg" href={gambling.url} target="_blank" rel="noopener nofollow">
                  {gambling.text}
                </a>
              ) : (
                <span key={i} data-ad-i={at(i)} hidden />
              ),
            )}
          </div>
        )}
      </div>
    </div>
  )
}
