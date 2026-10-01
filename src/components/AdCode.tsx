'use client'

import { useEffect, useRef } from 'react'

// An ad network's code from /admin/reklamer, run in the browser: the HTML is laid
// into the box and every <script> in it is made anew, so the browser runs it
// (scripts put in with innerHTML never run). Nothing on the server, so server and
// browser draw the same empty box first.

function run(target: HTMLElement, code: string) {
  const holder = document.createElement('div')
  holder.innerHTML = code
  for (const old of Array.from(holder.querySelectorAll('script'))) {
    const s = document.createElement('script')
    for (const a of Array.from(old.attributes)) s.setAttribute(a.name, a.value)
    s.text = old.text
    old.replaceWith(s)
  }
  const nodes = Array.from(holder.childNodes)
  for (const n of nodes) target.appendChild(n)
  return nodes
}

/**
 * A placement's code. On a placement shared by several advertisers (`turn` = its place in the
 * rotation) it runs only when it is the visit's banner – the others stay hidden and never load.
 */
export function AdCode({ code, turn }: { code: string; turn?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (turn !== undefined && getComputedStyle(el).display === 'none') return
    el.replaceChildren()
    run(el, code)
    return () => el.replaceChildren()
  }, [code, turn])
  return <div ref={ref} className="ad__code" data-ad-i={turn} />
}

const loaded = new Set<string>()

/** The code for every page's head (an ad network's main script), loaded once */
export function AdHeadCode({ code }: { code: string }) {
  useEffect(() => {
    if (loaded.has(code)) return
    loaded.add(code)
    run(document.head, code)
  }, [code])
  return null
}
