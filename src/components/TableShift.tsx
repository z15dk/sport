'use client'

import { useEffect, useRef, useState } from 'react'
import { useBadges } from './BadgeProvider'
import { sizedImage } from '../lib/imageSize'

// "Tabelforskydning": every club's place in the table after each round, as a
// 1200×500 chart of logos joined by dotted lines in the club's colour. It plays
// round by round when it scrolls into view (the logos of a round pop in, the
// lines grow to them); without JavaScript, or with reduced motion, it is
// simply the finished chart. Tap a logo to follow a club. Data from
// positionsByRound (src/data/season.ts).

export interface TableShiftRow {
  name: string
  /** Fallback line colour: the club's colour from our club list */
  color: string
  /** Place after each round in `rounds` */
  pos: number[]
}

const W = 1200
const H = 500
const LEFT = 52
const RIGHT = 4
const TOP = 46
const BOTTOM = 4
/** Gap between the row bands */
const GAP = 4
/** Time per round while it plays */
const STEP_MS = 380

/** The club's colour read from its logo (the most common strong colour), and whether the logo is (almost) all white */
function readLogo(img: HTMLImageElement): { color?: string; light: boolean } {
  try {
    const n = 24
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = n
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0, n, n)
    const d = ctx.getImageData(0, 0, n, n).data
    const bins = new Map<string, { w: number; r: number; g: number; b: number }>()
    let seen = 0
    let white = 0
    for (let i = 0; i < d.length; i += 4) {
      const [r, g, b, a] = [d[i], d[i + 1], d[i + 2], d[i + 3]]
      const max = Math.max(r, g, b)
      const sat = max ? (max - Math.min(r, g, b)) / max : 0
      if (a >= 200) {
        seen++
        if (Math.min(r, g, b) > 215) white++
      }
      // Skip see-through, near-white and near-black pixels: the colour is what is left
      if (a < 200 || (max > 230 && sat < 0.15) || max < 45) continue
      const key = `${r >> 5},${g >> 5},${b >> 5}`
      const w = 0.3 + sat
      const bin = bins.get(key) ?? { w: 0, r: 0, g: 0, b: 0 }
      bin.w += w
      bin.r += r * w
      bin.g += g * w
      bin.b += b * w
      bins.set(key, bin)
    }
    const best = [...bins.values()].sort((x, y) => y.w - x.w)[0]
    return {
      color: best ? `rgb(${Math.round(best.r / best.w)},${Math.round(best.g / best.w)},${Math.round(best.b / best.w)})` : undefined,
      light: seen > 0 && white / seen > 0.7,
    }
  } catch {
    // A logo from a host that does not allow reading its pixels
    return { light: false }
  }
}

function Logo({ name, url, x, y, size, shown, light }: { name: string; url?: string; x: number; y: number; size: number; shown: boolean; light?: boolean }) {
  return (
    <g className={`tshift__logo${shown ? ' is-on' : ''}`}>
      {/* A white logo gets a dark plate, so it does not vanish */}
      <circle cx={x} cy={y} r={size / 2 + 3} className={`tshift__plate${light ? ' is-dark' : ''}`} />
      {url ? (
        <image href={sizedImage(url, size)} x={x - size / 2} y={y - size / 2} width={size} height={size} preserveAspectRatio="xMidYMid meet" />
      ) : (
        <text x={x} y={y + 4} textAnchor="middle" className="tshift__initials">
          {name.slice(0, 3).toUpperCase()}
        </text>
      )}
    </g>
  )
}

/** Reads each club's line colour (and whether the logo is white) from its logo once it has loaded */
function useLogoColors(rows: TableShiftRow[], urls: (string | undefined)[]) {
  const [colors, setColors] = useState<Record<string, { color?: string; light: boolean }>>({})
  const key = urls.join('|')
  useEffect(() => {
    let live = true
    rows.forEach((r, i) => {
      const url = urls[i]
      if (!url) return
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        const c = readLogo(img)
        if (live) setColors((x) => ({ ...x, [r.name]: c }))
      }
      img.src = sizedImage(url, 16)
    })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the urls decide
  }, [key])
  return colors
}

export function TableShift({ league, rounds, rows, top, topLabel, bottom }: { league: string; rounds: number[]; rows: TableShiftRow[]; top: number; topLabel: string; bottom: number }) {
  const n = rows.length
  const rowH = (H - TOP - BOTTOM) / n
  const colW = (W - LEFT - RIGHT) / rounds.length
  const size = Math.min(Math.round(rowH * 0.68), Math.round(colW * 0.6), 34)
  const X = (i: number) => LEFT + colW * (i + 0.5)
  const Y = (p: number) => TOP + rowH * (p - 0.5)
  // How many rounds are shown: all of them before the page has run (the finished chart), then from 0 as it plays
  const [step, setStep] = useState(rounds.length)
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const ref = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setInterval>>(undefined)
  const badges = useBadges()
  const urls = rows.map((r) => badges[r.name])
  const colors = useLogoColors(rows, urls)

  function play() {
    clearInterval(timer.current)
    setStep(0)
    let s = 0
    timer.current = setInterval(() => {
      s++
      setStep(s)
      if (s >= rounds.length) clearInterval(timer.current)
    }, STEP_MS)
  }

  useEffect(() => {
    const el = ref.current
    if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return
    // Waits off screen, then plays once it is well in view
    const before = el.getBoundingClientRect().top > innerHeight
    if (!before) return
    setStep(0)
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect()
          play()
        }
      },
      { threshold: 0.2 },
    )
    io.observe(el)
    return () => {
      io.disconnect()
      clearInterval(timer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once
  }, [])

  // On a phone the chart scrolls sideways: start at the newest rounds
  useEffect(() => {
    const el = ref.current
    if (el && el.scrollWidth > el.clientWidth) el.scrollLeft = el.scrollWidth
  }, [])

  const toggle = (name: string) =>
    setChosen((c) => {
      const next = new Set(c)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  const any = chosen.size > 0
  const lastRound = rounds[rounds.length - 1]

  return (
    <section className="panel tshift">
      <header className="tshift__head">
        <h2 className="panel__title">Tabelforskydning</h2>
        <button type="button" className="pill tshift__play" onClick={play}>
          ▶ Afspil
        </button>
      </header>
      <div className="tshift__scroll" ref={ref}>
        <svg
          className="tshift__svg"
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Tabelforskydning i ${league}: hver klubs placering efter runde ${rounds[0]} til ${lastRound}`}
        >
          {/* A band per place, like the rows of the table and the match lists; the zones marked at the left as in the table */}
          {rows.map((_, i) => {
            const zone = i < top ? 'up' : i >= n - bottom ? 'down' : ''
            return (
              <g key={i}>
                <rect x={0} y={TOP + rowH * i + GAP / 2} width={W} height={rowH - GAP} rx={Math.min(14, (rowH - GAP) / 2)} className="tshift__band" />
                {zone && <rect x={0} y={TOP + rowH * i + GAP / 2 + 4} width={4} height={rowH - GAP - 8} rx={2} className={`tshift__zone tshift__zone--${zone}`} />}
                <text x={LEFT / 2} y={Y(i + 1) + 5} textAnchor="middle" className="tshift__pos">
                  {i + 1}
                </text>
              </g>
            )
          })}
          {/* The newest round: its column lightly marked, its heading as the active pill */}
          <rect x={X(rounds.length - 1) - colW / 2 + 2} y={TOP} width={colW - 4} height={H - TOP - BOTTOM} rx={14} className="tshift__now" />
          {rounds.map((r, i) =>
            i === rounds.length - 1 ? (
              <g key={r}>
                <rect x={X(i) - 26} y={8} width={52} height={28} rx={14} className="tshift__pill" />
                <text x={X(i)} y={27} textAnchor="middle" className="tshift__head-text is-last">
                  R{r}
                </text>
              </g>
            ) : (
              <text key={r} x={X(i)} y={27} textAnchor="middle" className="tshift__head-text">
                R{r}
              </text>
            ),
          )}
          <g>
            {rows.map((r) => {
              const on = chosen.has(r.name)
              return r.pos.slice(1).map((p, i) => (
                <line
                  key={`${r.name}-${i}`}
                  x1={X(i)}
                  y1={Y(r.pos[i])}
                  x2={X(i + 1)}
                  y2={Y(p)}
                  stroke={colors[r.name]?.color ?? r.color}
                  className={`tshift__line${i + 1 < step ? ' is-on' : ''}${on ? ' is-chosen' : any ? ' is-dim' : ''}`}
                />
              ))
            })}
          </g>
          {rows.map((r, k) => (
            <g
              key={r.name}
              className={`tshift__club${chosen.has(r.name) ? ' is-chosen' : any ? ' is-dim' : ''}`}
              onClick={() => toggle(r.name)}
              role="button"
              tabIndex={0}
              aria-pressed={chosen.has(r.name)}
              aria-label={`Følg ${r.name}`}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle(r.name))}
            >
              <title>{`${r.name}: nr. ${r.pos[r.pos.length - 1]} efter ${lastRound}. runde`}</title>
              {r.pos.map((p, i) => (
                <Logo key={i} name={r.name} url={urls[k]} x={X(i)} y={Y(p)} size={size} shown={i < step} light={colors[r.name]?.light} />
              ))}
            </g>
          ))}
        </svg>
      </div>
      <footer className="table-legend">
        {top > 0 && (
          <span>
            <i className="zone-dot zone-dot--up" /> {topLabel}
          </span>
        )}
        {bottom > 0 && (
          <span>
            <i className="zone-dot zone-dot--down" /> Nedrykning
          </span>
        )}
        <span>Tryk på et logo for at følge klubben</span>
      </footer>
    </section>
  )
}
