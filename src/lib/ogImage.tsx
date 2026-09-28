import 'server-only'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ImageResponse } from 'next/og'
import sharp from 'sharp'
import { sizedImage } from './imageSize'

// The picture shown when a page is shared (Facebook, X, Messenger, Slack ...)
// and in Google Discover: 1200×630 in the site's colours, with the page's
// title and, for matches and clubs, the teams' logos.

export const OG_SIZE = { width: 1200, height: 630 }

const BG = '#0f110c'
/** The picture's own colour, a shade lighter than the bar at its foot */
const CARD = '#1a1c1b'
const ACCENT = '#ff4a1f'

let fonts: { name: string; data: Buffer; weight: 700 | 800; style: 'normal' | 'italic' }[] | undefined
function loadFonts() {
  if (fonts) return fonts
  const file = (w: number, set: string, style = 'normal') =>
    readFileSync(path.join(/*turbopackIgnore: true*/ process.cwd(), 'node_modules/@fontsource/barlow-condensed/files', `barlow-condensed-${set}-${w}-${style}.woff`))
  fonts = [
    { name: 'Barlow', data: file(700, 'latin'), weight: 700, style: 'normal' },
    { name: 'Barlow', data: file(800, 'latin'), weight: 800, style: 'normal' },
    { name: 'Barlow', data: file(700, 'latin-ext'), weight: 700, style: 'normal' },
    { name: 'Barlow', data: file(800, 'latin-ext'), weight: 800, style: 'normal' },
    // The brand's slanted display type (the logo, titles and the score)
    { name: 'Barlow', data: file(800, 'latin', 'italic'), weight: 800, style: 'italic' },
    { name: 'Barlow', data: file(800, 'latin-ext', 'italic'), weight: 800, style: 'italic' },
  ]
  return fonts
}

/**
 * Matchly's M as a neon lime outline, big behind the picture (as on the social
 * media cards). Drawn as a path: the picture renderer has no text outline.
 */
const M_OUTLINE = `data:image/svg+xml;base64,${Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -4 150 108"><g transform="skewX(-12) translate(22 0)"><polygon points="0,100 0,0 26,0 50,46 74,0 100,0 100,100 76,100 76,42 57,78 43,78 24,42 24,100" fill="none" stroke="#c6f135" stroke-width="1.6" stroke-linejoin="round"/></g></svg>`,
).toString('base64')}`

/** A logo as a PNG data address (our own server serves it; nothing is fetched from the sources) */
export async function logoData(src?: string): Promise<string | undefined> {
  if (!src) return undefined
  try {
    const url = src.startsWith('/') ? `http://127.0.0.1:${process.env.PORT || 5173}${sizedImage(src, 128)}` : src
    if (!url.startsWith('http://127.0.0.1')) return undefined
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) })
    if (!res.ok) return undefined
    const png = await sharp(Buffer.from(await res.arrayBuffer()), { density: 300 })
      .resize(220, 220, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer()
    return `data:image/png;base64,${png.toString('base64')}`
  } catch {
    return undefined
  }
}

export interface OgSide {
  name: string
  logo?: string
  colors?: [string, string]
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => w.length > 2 || /^[A-ZÆØÅ]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')

function Badge({ side, size }: { side: OgSide; size: number }) {
  if (side.logo) return <img src={side.logo} width={size} height={size} style={{ objectFit: 'contain' }} alt="" />
  const [bg, fg] = side.colors ?? ['#2b3024', '#ffffff']
  return (
    <div style={{ width: size, height: size, borderRadius: size, background: bg, color: fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.36, fontWeight: 800 }}>
      {initials(side.name)}
    </div>
  )
}

function Side({ side }: { side: OgSide }) {
  return (
    <div style={{ width: 360, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <Badge side={side} size={190} />
      <div style={{ marginTop: 24, fontSize: side.name.length > 18 ? 40 : 50, fontWeight: 800, textAlign: 'center', lineHeight: 1.05 }}>{side.name}</div>
    </div>
  )
}

/** A share picture: a label (league, sport), a title, a line under it, and optionally one team or a match */
export function ogImage(opts: { label?: string; title: string; sub?: string; team?: OgSide; match?: { home: OgSide; away: OgSide; center: string } }) {
  const titleSize = opts.title.length > 48 ? 64 : opts.title.length > 30 ? 80 : 96
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: CARD, color: '#fff', fontFamily: 'Barlow', position: 'relative' }}>
        {/* The green M behind everything, partly off the picture */}
        <img src={M_OUTLINE} width={900} height={648} alt="" style={{ position: 'absolute', left: -120, top: -40, opacity: 0.32 }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '48px 72px 36px' }}>
          <div style={{ display: 'flex', fontSize: 32, fontWeight: 700, color: '#b8bdb0', letterSpacing: 1 }}>{opts.label ?? opts.sub ?? 'Live resultater, kampprogram og stillinger'}</div>
          {opts.match ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Side side={opts.match.home} />
              <div style={{ display: 'flex', fontSize: opts.match.center.length > 5 ? 84 : 128, fontWeight: 800, fontStyle: 'italic', color: '#fff' }}>{opts.match.center}</div>
              <Side side={opts.match.away} />
            </div>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
              {opts.team && (
                <div style={{ display: 'flex', marginRight: 48 }}>
                  <Badge side={opts.team} size={220} />
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                <div style={{ fontSize: titleSize, fontWeight: 800, fontStyle: 'italic', lineHeight: 1.02 }}>{opts.title}</div>
                {opts.label && opts.sub && <div style={{ marginTop: 18, fontSize: 36, fontWeight: 700, color: '#e6e8e1' }}>{opts.sub}</div>}
              </div>
            </div>
          )}
        </div>
        {/* The Matchly bar at the foot, as on the social media cards: the sender shows wherever it is shared */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: BG, padding: '26px 72px' }}>
          <div style={{ display: 'flex', fontSize: 64, fontWeight: 800, fontStyle: 'italic', lineHeight: 1, letterSpacing: -0.5 }}>
            MATCHLY<span style={{ color: ACCENT, marginLeft: -10 }}>.</span>
          </div>
          <div style={{ display: 'flex', fontSize: 30, fontWeight: 700, color: '#a3a89b' }}>{opts.match && opts.sub ? `${opts.sub} · matchly.dk` : 'matchly.dk'}</div>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts: loadFonts(), headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=3600' } },
  )
}
