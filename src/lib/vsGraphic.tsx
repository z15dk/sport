import 'server-only'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ImageResponse } from 'next/og'
import sharp from 'sharp'
import { getBadges } from './badges'
import { readLogo } from './customLogos'
import { proxiedPicture } from './imageProxy'
import { nationalTeams } from './nationalTeams'
import { mOutline, OG_SIZE, ogFonts } from './ogImage'
import { withPhotoDb } from './photos/server'
import { registerArticleUpload } from './photos/store'
import { readUpload, saveUpload } from './uploads'

// The VS graphic for an article (1200×630): the two clubs' logos with "VS" between them, a line on top
// and, if chosen, a photo behind them darkened so the logos stand out. Drawn by the same picture renderer
// as the share pictures (src/lib/ogImage.tsx) – no browser, no request to ourselves – so it takes well
// under a second and fails with a clear message. `vsGraphicPng` is the picture (the live preview in the
// article editor and /admin/grafik/vs), `makeVsGraphic` saves it as an upload (WebP, in the photo
// archive as a graphic credited Matchly.dk), ready as the article's picture.

export interface VsInput {
  home: string
  away: string
  top?: string
  /** A picture from our own site behind the logos ("/uploads/<fil>.webp") */
  bg?: string
}

const BG = '#11130e'
const LIME = '#c6f135'

/** Only pictures from our own site behind the logos */
const ownPath = (p?: string) => (p && p.startsWith('/') && !p.startsWith('//') ? p : undefined)

/** A picture of our own by its address: an upload, a logo uploaded in admin, a file in public/ or a source's picture through the proxy */
async function ownPicture(src: string): Promise<Buffer | undefined> {
  const [p] = src.split('?')
  let m = /^\/uploads\/([a-f0-9]{24}\.webp)$/.exec(p)
  if (m) return readUpload(m[1])
  m = /^\/api\/logo\/([a-z0-9-]+)$/.exec(p)
  if (m) return readLogo(m[1])?.bytes
  m = /^\/billede\/([a-f0-9]{20})(?:-\d+\.webp)?$/.exec(p)
  if (m) return proxiedPicture(m[1], 512)
  if (/^\/(logos|flag|icon|uploads)\//.test(p) && !p.includes('..')) {
    try {
      return readFileSync(path.join(/*turbopackIgnore: true*/ process.cwd(), 'public', decodeURIComponent(p)))
    } catch {
      // not a file of ours
    }
  }
  return undefined
}

/** A logo as PNG data, drawn to fit the box (an SVG at a density that keeps it sharp) */
async function logoData(src: string | undefined, width: number, height: number, cover = false): Promise<string | undefined> {
  if (!src) return undefined
  try {
    const bytes = await ownPicture(src)
    if (!bytes) return undefined
    const png = await sharp(bytes, { density: 300 })
      .resize(width, height, { fit: cover ? 'cover' : 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, withoutEnlargement: !cover })
      .png()
      .toBuffer()
    return `data:image/png;base64,${png.toString('base64')}`
  } catch {
    return undefined
  }
}

/** The photo behind the logos, cut to the picture's size as JPEG data */
async function photoData(src: string | undefined): Promise<string | undefined> {
  const p = ownPath(src)
  if (!p) return undefined
  try {
    const bytes = await ownPicture(p)
    if (!bytes) return undefined
    const jpeg = await sharp(bytes).resize(OG_SIZE.width, OG_SIZE.height, { fit: 'cover' }).jpeg({ quality: 82 }).toBuffer()
    return `data:image/jpeg;base64,${jpeg.toString('base64')}`
  } catch {
    return undefined
  }
}

function Club({ name, logo, flag }: { name: string; logo?: string; flag: boolean }) {
  const size = name.length > 16 ? 34 : 44
  return (
    <div style={{ width: 330, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {logo ? (
        flag ? (
          <img src={logo} width={300} height={200} alt="" style={{ margin: '40px 0', borderRadius: 14, objectFit: 'cover', boxShadow: '0 14px 40px rgba(0,0,0,0.55)' }} />
        ) : (
          <img src={logo} width={280} height={280} alt="" style={{ objectFit: 'contain' }} />
        )
      ) : (
        <div style={{ width: 220, height: 220, margin: '30px 0', borderRadius: 220, background: '#2a2d26', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 90, fontWeight: 800, fontStyle: 'italic' }}>
          {name.slice(0, 2).toUpperCase()}
        </div>
      )}
      <div style={{ marginTop: 22, fontSize: size, fontWeight: 800, fontStyle: 'italic', lineHeight: 1, textAlign: 'center', textShadow: '0 4px 20px rgba(0,0,0,0.6)' }}>{name.toUpperCase()}</div>
    </div>
  )
}

/** The graphic as PNG (1200×630) */
export async function vsGraphicPng(input: VsInput): Promise<Buffer> {
  const home = input.home.trim()
  const away = input.away.trim()
  if (!home || !away) throw new Error('Vælg begge klubber')
  const badges = await getBadges()
  const flags = nationalTeams()
  // A national team's flag when the name is one (our clubs' logos win, e.g. a club named like a country)
  const isFlag = (name: string) => !badges[name] && !!flags[name]
  const logoOf = (name: string) => (isFlag(name) ? logoData(flags[name], 600, 400, true) : logoData(badges[name] ?? flags[name], 560, 560))
  const [homeLogo, awayLogo, photo] = await Promise.all([logoOf(home), logoOf(away), photoData(input.bg)])
  const top = input.top?.trim()
  const res = new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', background: BG, color: '#fff', fontFamily: 'Barlow' }}>
        {photo && <img src={photo} width={OG_SIZE.width} height={OG_SIZE.height} alt="" style={{ position: 'absolute', left: 0, top: 0, objectFit: 'cover' }} />}
        {/* The photo darkened, most in the middle and at the top, so the logos and text stand out */}
        {photo && <div style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', background: 'radial-gradient(ellipse at center, rgba(17,19,14,0.35) 0%, rgba(17,19,14,0.82) 100%)' }} />}
        {photo && <div style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', background: 'linear-gradient(180deg, rgba(17,19,14,0.75) 0%, rgba(17,19,14,0.25) 35%, rgba(17,19,14,0.55) 100%)' }} />}
        {/* The big M behind the clubs, as an outline */}
        <img src={mOutline(photo ? 'rgba(198,241,53,0.18)' : '#23271a', 0.5)} width={1000} height={720} alt="" style={{ position: 'absolute', left: 100, top: -60 }} />
        {top && (
          <div style={{ position: 'absolute', left: 0, top: 44, width: '100%', display: 'flex', justifyContent: 'center', fontSize: 20, fontWeight: 700, letterSpacing: 2, color: LIME }}>{top.toUpperCase()}</div>
        )}
        <div style={{ position: 'absolute', left: 0, top: 110, width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <Club name={home} logo={homeLogo} flag={isFlag(home)} />
          <div style={{ display: 'flex', margin: '0 70px', fontSize: 150, fontWeight: 800, fontStyle: 'italic', lineHeight: 1, color: LIME, textShadow: '0 6px 30px rgba(0,0,0,0.5)' }}>VS</div>
          <Club name={away} logo={awayLogo} flag={isFlag(away)} />
        </div>
        <div style={{ position: 'absolute', right: 56, bottom: 30, display: 'flex', fontSize: 26, fontWeight: 800, fontStyle: 'italic', lineHeight: 1 }}>
          MATCHLY<span style={{ color: '#ff4a1f' }}>.</span>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts: ogFonts() },
  )
  return Buffer.from(await res.arrayBuffer())
}

/** The graphic saved as an upload, ready as the article's picture */
export async function makeVsGraphic(input: VsInput): Promise<{ url: string }> {
  const png = await vsGraphicPng(input)
  const saved = await saveUpload(png, 1200)
  if (saved.error || !saved.url) throw new Error(saved.error ?? 'Grafikken kunne ikke gemmes')
  try {
    const name = saved.url.replace('/uploads/', '')
    withPhotoDb((db) => {
      const id = registerArticleUpload(db, name)
      db.prepare(`UPDATE photos SET kind = 'grafik', kind_manual = 1, credit = 'Matchly.dk', metadata_done = 1, title = ? WHERE id = ?`).run(`${input.home.trim()} vs ${input.away.trim()}`, id)
    })
  } catch {
    // the article still gets its picture
  }
  return { url: saved.url }
}
