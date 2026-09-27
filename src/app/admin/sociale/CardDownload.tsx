'use client'

import { useState } from 'react'

// Saves the social media cards as PNG files (1080 px wide, like the real
// posts). The picture is made in the browser from the card on the page; logos
// from other hosts go through /api/admin/logo-proxy, as a browser may only
// draw images from our own address into a picture.

const WIDTH = 1080

/** Our own address for a logo from another host */
function sameOrigin(src: string) {
  try {
    const url = new URL(src, location.href)
    return url.origin === location.origin ? src : `/api/admin/logo-proxy?url=${encodeURIComponent(url.href)}`
  } catch {
    return src
  }
}

async function saveCard(card: HTMLElement, file: string) {
  const { toPng } = await import('html-to-image')
  const images = [...card.querySelectorAll('img')]
  const original = images.map((img) => img.getAttribute('src') ?? '')
  // Logos through our own address while the picture is made
  await Promise.all(
    images.map(
      (img, i) =>
        new Promise<void>((resolve) => {
          const next = sameOrigin(original[i])
          if (next === original[i]) return resolve()
          img.onload = img.onerror = () => resolve()
          img.src = next
        }),
    ),
  )
  try {
    const url = await toPng(card, { pixelRatio: WIDTH / card.offsetWidth, cacheBust: false })
    const a = document.createElement('a')
    a.href = url
    a.download = `${file}.png`
    a.click()
  } finally {
    images.forEach((img, i) => img.setAttribute('src', original[i]))
  }
}

/** A card's file name: the section (date and kind), its number in the carousel and its name */
function fileName(card: HTMLElement) {
  const rail = card.closest<HTMLElement>('[data-rail]')
  const cards = [...(rail?.querySelectorAll<HTMLElement>('[data-card]') ?? [])]
  const n = cards.indexOf(card) + 1
  return [rail?.dataset.rail, n > 0 ? String(n) : undefined, card.dataset.card].filter(Boolean).join('-')
}

/** "Hent billede" under one card */
export function CardDownload() {
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle')
  return (
    <button
      type="button"
      className="text-btn"
      disabled={state === 'busy'}
      onClick={async (e) => {
        const card = e.currentTarget.closest('figure')?.querySelector<HTMLElement>('[data-card]')
        if (!card) return
        setState('busy')
        try {
          await saveCard(card, fileName(card))
          setState('idle')
        } catch {
          setState('error')
        }
      }}
    >
      {state === 'busy' ? 'Laver billede …' : state === 'error' ? 'Kunne ikke lave billedet – prøv igen' : 'Hent billede'}
    </button>
  )
}

/** "Hent alle" for a whole carousel: the cards one after the other */
export function RailDownload({ label = 'Hent alle' }: { label?: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle')
  return (
    <button
      type="button"
      className="pill"
      disabled={state === 'busy'}
      onClick={async (e) => {
        const rail = e.currentTarget.closest('[data-rail]')
        const cards = [...(rail?.querySelectorAll<HTMLElement>('[data-card]') ?? [])]
        setState('busy')
        try {
          for (const card of cards) await saveCard(card, fileName(card))
          setState('idle')
        } catch {
          setState('error')
        }
      }}
    >
      {state === 'busy' ? 'Laver billeder …' : state === 'error' ? 'Noget gik galt – prøv igen' : label}
    </button>
  )
}
