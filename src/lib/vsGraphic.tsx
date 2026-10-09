import 'server-only'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ImageResponse } from 'next/og'
import sharp from 'sharp'
import { getBadges } from './badges'
import { readLogo } from './customLogos'
import { proxiedPicture, proxyImage } from './imageProxy'
import { nationalTeams } from './nationalTeams'
import { mOutline, OG_SIZE, ogFonts } from './ogImage'
import { withPhotoDb } from './photos/server'
import { allTeams } from '../data/teams'
import { externalLeagueKey } from '../data/external'
import { shownDivisions } from '../data/leagues'
import { divisionOfGame } from '../data/ourLeagues'
import { getRealData } from '../data/real'
import { customLogoUrl } from './customLogos'
import { englishNation, foldCountry } from '../data/countries'
import { flagCode } from '../data/flagCodes'
import { flagSource } from './flags'
import { STANDARD_KLUBFARVE, klubfarve } from '../data/klubfarver'
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
async function logoData(src: string | undefined, width: number, height: number, cover = false, enlarge = false): Promise<string | undefined> {
  if (!src) return undefined
  try {
    const bytes = await ownPicture(src)
    if (!bytes) return undefined
    const png = await sharp(bytes, { density: 300 })
      .resize(width, height, { fit: cover ? 'cover' : 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, withoutEnlargement: !cover && !enlarge })
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
        {/* The photo darkened just enough for the logos and text to stand out – a little more at the top line and the edges – so the photo is still clearly seen */}
        {photo && <div style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', background: 'linear-gradient(180deg, rgba(17,19,14,0.55) 0%, rgba(17,19,14,0.3) 30%, rgba(17,19,14,0.3) 70%, rgba(17,19,14,0.5) 100%)' }} />}
        {photo && <div style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', background: 'radial-gradient(ellipse at center, rgba(17,19,14,0) 45%, rgba(17,19,14,0.35) 100%)' }} />}
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

// ---------------------------------------------------------------- one club

/**
 * The background of the club picture, as the league pages' top (.lx-hero): dark, the club's colour from the top
 * right, a lime glow from the bottom left, and a dot pattern that fades in towards the club's colour. Drawn as one
 * SVG, so the picture renderer needs no gradients or masks of its own.
 */
function clubBackground(color: string, photo = false): string {
  const { width: w, height: h } = OG_SIZE
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs>
<linearGradient id="base" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#171c0d"/><stop offset="1" stop-color="#0b0d07"/></linearGradient>
<radialGradient id="club" cx="${w}" cy="0" r="${w * 0.75}" gradientUnits="userSpaceOnUse" gradientTransform="translate(${w} 0) scale(1 1.15) translate(${-w} 0)"><stop offset="0" stop-color="${color}" stop-opacity="0.55"/><stop offset="0.7" stop-color="${color}" stop-opacity="0"/></radialGradient>
<radialGradient id="lime" cx="0" cy="${h}" r="${w * 0.6}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#c6f135" stop-opacity="0.16"/><stop offset="0.7" stop-color="#c6f135" stop-opacity="0"/></radialGradient>
<pattern id="dots" width="26" height="26" patternUnits="userSpaceOnUse"><circle cx="13" cy="13" r="2.2" fill="#c6f135" fill-opacity="0.4"/></pattern>
<radialGradient id="fade" cx="${w}" cy="0" r="${w * 1.1}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset="0.55" stop-color="#fff" stop-opacity="0.25"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<mask id="m"><rect width="${w}" height="${h}" fill="url(#fade)"/></mask>
</defs>
${photo ? `<rect width="${w}" height="${h}" fill="#0b0d07" fill-opacity="0.68"/>` : `<rect width="${w}" height="${h}" fill="url(#base)"/>`}
<rect width="${w}" height="${h}" fill="url(#dots)" mask="url(#m)"/>
<rect width="${w}" height="${h}" fill="url(#club)"/>
<rect width="${w}" height="${h}" fill="url(#lime)"/>
</svg>`
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}

/** A club's colour for its picture: the club pages' colour (src/data/klubfarver.ts), else the league pages' olive */
function clubColor(name: string, flag: boolean): string {
  // A national team by its address's English name ("Danmark" -> "denmark"), where the national colours are kept
  const english = flag ? englishNation(foldCountry(name)) : undefined
  const team = english ? undefined : allTeams().find((t) => t.name === name || t.names?.includes(name))
  const color = english ? klubfarve(english.replace(/[^a-z]+/g, '-')) : team ? klubfarve(team.slug, team.colors) : undefined
  return color && color !== STANDARD_KLUBFARVE ? color : '#2c3a0c'
}

/** The club picture as PNG (1200×630): only the club's logo (or a national team's flag) on Matchly's dark top */
export async function clubGraphicPng(input: { club: string; bg?: string }): Promise<Buffer> {
  const club = input.club.trim()
  if (!club) throw new Error('Vælg en klub')
  const badges = await getBadges()
  const flags = nationalTeams()
  const flag = !badges[club] && !!flags[club]
  // A flag drawn big from its source (the national teams' list keeps only a small copy)
  const code = flag ? flagCode(club, true) : undefined
  const photo = await photoData(input.bg)
  const logo = flag ? await logoData(code ? proxyImage(flagSource(code).replace("/w160/", "/w640/")) : flags[club], 630, 420, true) : await logoData(badges[club], 680, 680, false, true)
  const res = new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', background: BG, color: '#fff', fontFamily: 'Barlow' }}>
        {/* A photo of our own behind it, seen through the dark top (the colour, dots and M lie over it) */}
        {photo && <img src={photo} width={OG_SIZE.width} height={OG_SIZE.height} alt="" style={{ position: 'absolute', left: 0, top: 0, objectFit: 'cover' }} />}
        <img src={clubBackground(clubColor(club, flag), !!photo)} width={OG_SIZE.width} height={OG_SIZE.height} alt="" style={{ position: 'absolute', left: 0, top: 0 }} />
        {/* The big M as on the league pages' top: an outline, cut off at the bottom right */}
        <img src={mOutline('rgba(198,241,53,0.14)', 0.45)} width={900} height={648} alt="" style={{ position: 'absolute', left: 420, top: 150 }} />
        <div style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: 540, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {logo ? (
            flag ? (
              <img src={logo} width={420} height={280} alt="" style={{ borderRadius: 18, objectFit: 'cover', boxShadow: '0 14px 40px rgba(0,0,0,0.55)' }} />
            ) : (
              <img src={logo} width={340} height={340} alt="" style={{ objectFit: 'contain' }} />
            )
          ) : (
            <div style={{ display: 'flex', fontSize: 120, fontWeight: 800, fontStyle: 'italic', lineHeight: 1, textAlign: 'center' }}>{club.toUpperCase()}</div>
          )}
        </div>
        <div style={{ position: 'absolute', left: 0, bottom: 44, width: '100%', display: 'flex', justifyContent: 'center', fontSize: 50, fontWeight: 800, fontStyle: 'italic', lineHeight: 1 }}>
          MATCHLY<span style={{ color: '#ff4a1f' }}>.</span>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts: ogFonts() },
  )
  return Buffer.from(await res.arrayBuffer())
}

/** The club picture saved as an upload, ready as the article's picture */
export async function makeClubGraphic(input: { club: string; bg?: string }): Promise<{ url: string }> {
  const png = await clubGraphicPng(input)
  const saved = await saveUpload(png, 1200)
  if (saved.error || !saved.url) throw new Error(saved.error ?? 'Billedet kunne ikke gemmes')
  try {
    const name = saved.url.replace('/uploads/', '')
    withPhotoDb((db) => {
      const id = registerArticleUpload(db, name)
      db.prepare(`UPDATE photos SET kind = 'grafik', kind_manual = 1, credit = 'Matchly.dk', metadata_done = 1, title = ? WHERE id = ?`).run(input.club.trim(), id)
    })
  } catch {
    // the article still gets its picture
  }
  return { url: saved.url }
}

// ---------------------------------------------------------------- one league

/**
 * The leagues that can have a picture, by the name shown on the site, with their logo: ours (the logo uploaded in
 * admin or found for the league) and API-Sports' other leagues in the fetched days (A-Liga, Serie A, ...). A name
 * two countries share ("Premier League") gets the country after it.
 */
export async function leagueLogos(): Promise<Record<string, string>> {
  const badges = await getBadges()
  const out: Record<string, string> = {}
  for (const d of shownDivisions()) {
    const logo = customLogoUrl(`liga-${d.slug}`) ?? badges[d.name]
    if (logo) out[d.name] = logo
  }
  const seen = new Map<string, { name: string; country?: string; logo: string }>()
  for (const g of getRealData()?.external ?? []) {
    if (!g.league.logo || divisionOfGame(g)) continue
    const key = externalLeagueKey(g.league)
    if (!seen.has(key)) seen.set(key, { name: g.league.name, country: g.league.country, logo: customLogoUrl(`liga-${key}`) ?? proxyImage(g.league.logo) })
  }
  const count = new Map<string, number>()
  for (const l of seen.values()) count.set(l.name, (count.get(l.name) ?? 0) + 1)
  for (const l of seen.values()) {
    const name = (count.get(l.name) ?? 0) > 1 || out[l.name] ? `${l.name} (${l.country ?? '?'})` : l.name
    out[name] ??= l.logo
  }
  return out
}

/** The league picture as PNG (1200×630): the league's logo and its name on Matchly's dark top, as the club picture */
export async function leagueGraphicPng(input: { league: string; card?: boolean; bg?: string }): Promise<Buffer> {
  const league = input.league.trim()
  if (!league) throw new Error('Vælg en liga')
  const logos = await leagueLogos()
  if (!logos[league]) throw new Error(`Ingen liga med logo hedder "${league}"`)
  const card = input.card !== false
  const [logo, photo] = await Promise.all([logoData(logos[league], 920, 640, false, true), photoData(input.bg)])
  // The name without the country added to tell two leagues apart
  const name = league.replace(/\s*\([^)]*\)$/, '')
  const res = new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', background: BG, color: '#fff', fontFamily: 'Barlow' }}>
        {/* A photo of our own behind it, seen through the dark top */}
        {photo && <img src={photo} width={OG_SIZE.width} height={OG_SIZE.height} alt="" style={{ position: 'absolute', left: 0, top: 0, objectFit: 'cover' }} />}
        <img src={clubBackground('#2c3a0c', !!photo)} width={OG_SIZE.width} height={OG_SIZE.height} alt="" style={{ position: 'absolute', left: 0, top: 0 }} />
        <img src={mOutline('rgba(198,241,53,0.14)', 0.45)} width={900} height={648} alt="" style={{ position: 'absolute', left: 420, top: 150 }} />
        <div style={{ position: 'absolute', left: 0, top: 20, width: '100%', height: 510, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          {logo &&
            (card ? (
              // A light card behind the logo (the default): many league logos are dark and would vanish on the dark top
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 520, height: 360, borderRadius: 40, background: '#f4f5f1', boxShadow: '0 18px 50px rgba(0,0,0,0.5)' }}>
                <img src={logo} width={460} height={300} alt="" style={{ objectFit: 'contain' }} />
              </div>
            ) : (
              <img src={logo} width={460} height={360} alt="" style={{ objectFit: 'contain' }} />
            ))}
          <div style={{ display: 'flex', marginTop: logo ? 34 : 0, fontSize: name.length > 22 ? 48 : 64, fontWeight: 800, fontStyle: 'italic', lineHeight: 1, textAlign: 'center', textShadow: '0 4px 20px rgba(0,0,0,0.6)' }}>{name.toUpperCase()}</div>
        </div>
        <div style={{ position: 'absolute', left: 0, bottom: 44, width: '100%', display: 'flex', justifyContent: 'center', fontSize: 50, fontWeight: 800, fontStyle: 'italic', lineHeight: 1 }}>
          MATCHLY<span style={{ color: '#ff4a1f' }}>.</span>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts: ogFonts() },
  )
  return Buffer.from(await res.arrayBuffer())
}

/** The league picture saved as an upload, ready as the article's picture */
export async function makeLeagueGraphic(input: { league: string; card?: boolean; bg?: string }): Promise<{ url: string }> {
  const png = await leagueGraphicPng(input)
  const saved = await saveUpload(png, 1200)
  if (saved.error || !saved.url) throw new Error(saved.error ?? 'Billedet kunne ikke gemmes')
  try {
    const name = saved.url.replace('/uploads/', '')
    withPhotoDb((db) => {
      const id = registerArticleUpload(db, name)
      db.prepare(`UPDATE photos SET kind = 'grafik', kind_manual = 1, credit = 'Matchly.dk', metadata_done = 1, title = ? WHERE id = ?`).run(input.league.trim(), id)
    })
  } catch {
    // the article still gets its picture
  }
  return { url: saved.url }
}

// ---------------------------------------------------------------- the result of a match

export interface ResultInput {
  home: string
  away: string
  hs: number
  as: number
  /** The line on top: the league and the day ("3. division · lørdag 3. oktober") */
  top?: string
  /** The names the logos are kept under, when they aren't the team names (the women's teams use their club's logo) */
  homeLogo?: string
  awayLogo?: string
  /** Each side's goals as "Zuberovski 25'", in match order */
  homeGoals?: string[]
  awayGoals?: string[]
  /** Which of the eight designs (RESULT_VARIANTS); the classic one when unset */
  variant?: ResultVariant
  /** The big line in the "overskrift" design, e.g. "Myhra reddede straffesparket" */
  headline?: string
}

/**
 * The eight result designs James chooses between for a report (deploy/claude-editor/NYHEDER.md says which fits when):
 * klassisk – both logos and the score in the middle; vinder – the winner's colour and logo fill the picture;
 * diagonal – the clubs' colours split on a slant; lime – Matchly's lime all over (stands out in a feed);
 * tidslinje – the goals on a 90-minute line (comebacks, late goals); overskrift – the match's story in big letters
 * with a score bar; minimal – type only, no logos; tv – a TV score bug with the scorers under it.
 */
export const RESULT_VARIANTS = ['klassisk', 'vinder', 'diagonal', 'lime', 'tidslinje', 'overskrift', 'minimal', 'tv'] as const
export type ResultVariant = (typeof RESULT_VARIANTS)[number]
/** The designs the owner has approved (9/10-2026) – the only ones James may choose; vinder, lime and tidslinje are being reworked */
export const RESULT_VARIANTS_IN_USE: ResultVariant[] = ['klassisk', 'diagonal', 'overskrift', 'minimal', 'tv']

/** Two clubs' colours from each top corner on Matchly's dark top, with the dots fading in from the middle top */
function resultBackground(left: string, right: string): string {
  const { width: w, height: h } = OG_SIZE
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs>
<linearGradient id="base" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#171c0d"/><stop offset="1" stop-color="#0b0d07"/></linearGradient>
<radialGradient id="l" cx="0" cy="0" r="${w * 0.6}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${left}" stop-opacity="0.55"/><stop offset="0.75" stop-color="${left}" stop-opacity="0"/></radialGradient>
<radialGradient id="r" cx="${w}" cy="0" r="${w * 0.6}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${right}" stop-opacity="0.55"/><stop offset="0.75" stop-color="${right}" stop-opacity="0"/></radialGradient>
<radialGradient id="lime" cx="${w / 2}" cy="${h}" r="${w * 0.45}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#c6f135" stop-opacity="0.14"/><stop offset="0.7" stop-color="#c6f135" stop-opacity="0"/></radialGradient>
<pattern id="dots" width="26" height="26" patternUnits="userSpaceOnUse"><circle cx="13" cy="13" r="2.2" fill="#c6f135" fill-opacity="0.35"/></pattern>
<radialGradient id="fade" cx="${w / 2}" cy="0" r="${w * 0.55}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff" stop-opacity="0.8"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<mask id="m"><rect width="${w}" height="${h}" fill="url(#fade)"/></mask>
</defs>
<rect width="${w}" height="${h}" fill="url(#base)"/>
<rect width="${w}" height="${h}" fill="url(#dots)" mask="url(#m)"/>
<rect width="${w}" height="${h}" fill="url(#l)"/>
<rect width="${w}" height="${h}" fill="url(#r)"/>
<rect width="${w}" height="${h}" fill="url(#lime)"/>
</svg>`
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}

/** One side of the result: logo, name and its scorers */
function ResultSide({ name, logo, goals }: { name: string; logo?: string; goals: string[] }) {
  const shown = goals.slice(0, 4)
  return (
    <div style={{ width: 360, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {logo ? (
        <img src={logo} width={210} height={210} alt="" style={{ objectFit: 'contain' }} />
      ) : (
        <div style={{ width: 170, height: 170, margin: '20px 0', borderRadius: 170, background: '#2a2d26', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 72, fontWeight: 800, fontStyle: 'italic' }}>{name.slice(0, 2).toUpperCase()}</div>
      )}
      <div style={{ marginTop: 18, fontSize: name.length > 18 ? 30 : 38, fontWeight: 800, fontStyle: 'italic', lineHeight: 1, textAlign: 'center', textShadow: '0 4px 20px rgba(0,0,0,0.6)' }}>{name.toUpperCase()}</div>
      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, fontFamily: 'DM Sans', fontSize: 22, fontWeight: 500, color: 'rgba(255,255,255,0.82)' }}>
        {shown.map((g, i) => (
          <div key={i} style={{ display: 'flex' }}>
            {g}
          </div>
        ))}
        {goals.length > shown.length && <div style={{ display: 'flex', color: 'rgba(255,255,255,0.6)' }}>+{goals.length - shown.length} mere</div>}
      </div>
    </div>
  )
}

/** A club's colour as a darker shade (for big areas, so white text stays readable) */
function shade(hex: string, f = 0.55): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return '#2c3a0c'
  const n = parseInt(m[1], 16)
  const c = (v: number) => Math.round(v * f).toString(16).padStart(2, '0')
  return `#${c((n >> 16) & 255)}${c((n >> 8) & 255)}${c(n & 255)}`
}

const svgData = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`

/** The minute of a scorer line ("Kjærgaard 67'", "Njai 90+3'") */
const goalMinute = (g: string) => {
  const m = /(\d+)(?:\+(\d+))?'?\s*$/.exec(g)
  return m ? Math.min(Number(m[1]) + (m[2] ? Number(m[2]) / 10 : 0), 96) : undefined
}

function Brand({ color = '#fff', dot = '#ff4a1f' }: { color?: string; dot?: string }) {
  return (
    <div style={{ position: 'absolute', right: 56, bottom: 30, display: 'flex', fontSize: 26, fontWeight: 800, fontStyle: 'italic', lineHeight: 1, color }}>
      MATCHLY<span style={{ color: dot }}>.</span>
    </div>
  )
}

function Crest({ name, logo, size, ring }: { name: string; logo?: string; size: number; ring?: string }) {
  return ring ? (
    <div style={{ width: size, height: size, borderRadius: size, background: ring, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {logo ? <img src={logo} width={size * 0.72} height={size * 0.72} alt="" style={{ objectFit: 'contain' }} /> : <div style={{ display: 'flex', fontSize: size * 0.34, fontWeight: 800, fontStyle: 'italic', color: BG }}>{name.slice(0, 2).toUpperCase()}</div>}
    </div>
  ) : logo ? (
    <img src={logo} width={size} height={size} alt="" style={{ objectFit: 'contain' }} />
  ) : (
    <div style={{ width: size * 0.8, height: size * 0.8, margin: size * 0.1, borderRadius: size, background: '#2a2d26', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.34, fontWeight: 800, fontStyle: 'italic' }}>{name.slice(0, 2).toUpperCase()}</div>
  )
}

function Scorers({ goals, color = 'rgba(255,255,255,0.82)', align = 'center', size = 22, max = 4 }: { goals: string[]; color?: string; align?: 'center' | 'flex-start' | 'flex-end'; size?: number; max?: number }) {
  const shown = goals.slice(0, max)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: align, gap: 4, fontFamily: 'DM Sans', fontSize: size, fontWeight: 500, color }}>
      {shown.map((g, i) => (
        <div key={i} style={{ display: 'flex' }}>
          {g}
        </div>
      ))}
      {goals.length > shown.length && <div style={{ display: 'flex', opacity: 0.7 }}>+{goals.length - shown.length} mere</div>}
    </div>
  )
}

/** The match's result as PNG (1200×630) in one of the eight designs (RESULT_VARIANTS) */
export async function resultGraphicPng(input: ResultInput): Promise<Buffer> {
  const home = input.home.trim()
  const away = input.away.trim()
  if (!home || !away) throw new Error('Begge hold skal med')
  const badges = await getBadges()
  const [homeLogo, awayLogo] = await Promise.all([logoData(badges[input.homeLogo ?? home] ?? badges[home], 420, 420), logoData(badges[input.awayLogo ?? away] ?? badges[away], 420, 420)])
  const hc = clubColor(input.homeLogo ?? home, false)
  const ac = clubColor(input.awayLogo ?? away, false)
  const hg = input.homeGoals ?? []
  const ag = input.awayGoals ?? []
  const { hs, as } = input
  const draw = hs === as
  // "vinder" needs a winner: a draw gets the classic design
  const variant: ResultVariant = input.variant === 'vinder' && draw ? 'klassisk' : (input.variant ?? 'klassisk')
  const top = input.top?.trim()
  const { width: W, height: H } = OG_SIZE
  const nameSize = (n: string, big: number) => (n.length > 18 ? big * 0.78 : big)
  // The layers straight in the picture (not inside a fragment: the renderer measures 100% widths against it as 0)
  const frame = (layers: React.ReactElement, background = BG, color = '#fff') => (
    <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', background, color, fontFamily: 'Barlow' }}>{(layers.props as { children: React.ReactNode }).children}</div>
  )
  const topLine = (color = LIME, y = 40, pill = false) =>
    top && (
      <div style={{ position: 'absolute', left: 0, top: y, width: '100%', display: 'flex', justifyContent: 'center' }}>
        <div style={{ display: 'flex', fontFamily: 'DM Sans', fontSize: 24, fontWeight: 600, color, ...(pill && { background: BG, padding: '8px 20px', borderRadius: 40 }) }}>{top}</div>
      </div>
    )

  let picture: React.ReactNode
  switch (variant) {
    case 'vinder': {
      const homeWon = hs > as
      const [wName, wLogo, wColor, wGoals] = homeWon ? [home, homeLogo, hc, hg] : [away, awayLogo, ac, ag]
      const [lName, lLogo] = homeWon ? [away, awayLogo] : [home, homeLogo]
      const bg = svgData(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><radialGradient id="g" cx="${W * 0.22}" cy="${H * 0.5}" r="${W * 0.75}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${wColor}" stop-opacity="0.95"/><stop offset="0.6" stop-color="${shade(wColor, 0.35)}" stop-opacity="1"/><stop offset="1" stop-color="#0b0d07"/></radialGradient></defs><rect width="${W}" height="${H}" fill="url(#g)"/></svg>`)
      picture = frame(
        <>
          <img src={bg} width={W} height={H} alt="" style={{ position: 'absolute', left: 0, top: 0 }} />
          <img src={mOutline('rgba(255,255,255,0.10)', 0.5)} width={760} height={547} alt="" style={{ position: 'absolute', left: 520, top: 120 }} />
          <div style={{ position: 'absolute', left: 60, top: 0, height: H, display: 'flex', alignItems: 'center' }}>
            <Crest name={wName} logo={wLogo} size={340} />
          </div>
          <div style={{ position: 'absolute', left: 450, top: 70, width: 700, display: 'flex', flexDirection: 'column' }}>
            {top && <div style={{ display: 'flex', fontFamily: 'DM Sans', fontSize: 24, fontWeight: 600, color: LIME }}>{top}</div>}
            <div style={{ display: 'flex', marginTop: 18, fontFamily: 'DM Sans', fontSize: 30, fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>Sejr til</div>
            <div style={{ display: 'flex', fontSize: nameSize(wName, 84), fontWeight: 800, fontStyle: 'italic', lineHeight: 1, textShadow: '0 4px 24px rgba(0,0,0,0.5)' }}>{wName.toUpperCase()}</div>
            <div style={{ display: 'flex', alignItems: 'center', marginTop: 22, gap: 22 }}>
              <div style={{ display: 'flex', fontSize: 120, fontWeight: 800, fontStyle: 'italic', lineHeight: 1, color: LIME }}>
                {hs}–{as}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontFamily: 'DM Sans', fontSize: 28, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>
                mod
                <Crest name={lName} logo={lLogo} size={64} />
                {lName}
              </div>
            </div>
            <div style={{ display: 'flex', marginTop: 18 }}>
              <Scorers goals={wGoals} align="flex-start" />
            </div>
          </div>
          <Brand />
        </>,
      )
      break
    }
    case 'diagonal': {
      const bg = svgData(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><polygon points="0,0 ${W * 0.58},0 ${W * 0.42},${H} 0,${H}" fill="${shade(hc)}"/><polygon points="${W * 0.58},0 ${W},0 ${W},${H} ${W * 0.42},${H}" fill="${shade(ac)}"/><line x1="${W * 0.58}" y1="0" x2="${W * 0.42}" y2="${H}" stroke="${LIME}" stroke-width="8"/><rect width="${W}" height="${H}" fill="#000" fill-opacity="0.18"/></svg>`)
      picture = frame(
        <>
          <img src={bg} width={W} height={H} alt="" style={{ position: 'absolute', left: 0, top: 0 }} />
          {topLine('#fff', 34, true)}
          <div style={{ position: 'absolute', left: 40, top: 110, width: 380, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Crest name={home} logo={homeLogo} size={210} />
            <div style={{ display: 'flex', marginTop: 16, fontSize: nameSize(home, 38), fontWeight: 800, fontStyle: 'italic', textAlign: 'center' }}>{home.toUpperCase()}</div>
            <div style={{ display: 'flex', marginTop: 10 }}>
              <Scorers goals={hg} max={3} />
            </div>
          </div>
          <div style={{ position: 'absolute', right: 40, top: 110, width: 380, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Crest name={away} logo={awayLogo} size={210} />
            <div style={{ display: 'flex', marginTop: 16, fontSize: nameSize(away, 38), fontWeight: 800, fontStyle: 'italic', textAlign: 'center' }}>{away.toUpperCase()}</div>
            <div style={{ display: 'flex', marginTop: 10 }}>
              <Scorers goals={ag} max={3} />
            </div>
          </div>
          <div style={{ position: 'absolute', left: 440, top: 215, width: 320, height: 170, borderRadius: 26, background: BG, border: `4px solid ${LIME}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 120, fontWeight: 800, fontStyle: 'italic', color: LIME, lineHeight: 1 }}>
            {hs}–{as}
          </div>
          <Brand />
        </>,
      )
      break
    }
    case 'lime': {
      picture = frame(
        <>
          <img src={mOutline('rgba(17,19,14,0.12)', 0.6)} width={900} height={648} alt="" style={{ position: 'absolute', left: 150, top: 20 }} />
          {topLine(BG)}
          <div style={{ position: 'absolute', left: 0, top: 110, width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
            <div style={{ width: 360, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <Crest name={home} logo={homeLogo} size={210} ring="#fff" />
              <div style={{ display: 'flex', marginTop: 16, fontSize: nameSize(home, 38), fontWeight: 800, fontStyle: 'italic', textAlign: 'center' }}>{home.toUpperCase()}</div>
              <div style={{ display: 'flex', marginTop: 8 }}>
                <Scorers goals={hg} color="rgba(17,19,14,0.8)" max={3} />
              </div>
            </div>
            <div style={{ width: 300, display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 30 }}>
              <div style={{ display: 'flex', fontFamily: 'DM Sans', fontSize: 22, fontWeight: 600, color: 'rgba(17,19,14,0.7)' }}>Slut</div>
              <div style={{ display: 'flex', fontSize: 160, fontWeight: 800, fontStyle: 'italic', lineHeight: 1 }}>
                {hs}–{as}
              </div>
            </div>
            <div style={{ width: 360, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <Crest name={away} logo={awayLogo} size={210} ring="#fff" />
              <div style={{ display: 'flex', marginTop: 16, fontSize: nameSize(away, 38), fontWeight: 800, fontStyle: 'italic', textAlign: 'center' }}>{away.toUpperCase()}</div>
              <div style={{ display: 'flex', marginTop: 8 }}>
                <Scorers goals={ag} color="rgba(17,19,14,0.8)" max={3} />
              </div>
            </div>
          </div>
          <Brand color={BG} />
        </>,
        LIME,
        BG,
      )
      break
    }
    case 'tidslinje': {
      const x0 = 100
      const x1 = 1100
      const y = 400
      const at = (min: number) => x0 + ((x1 - x0) * Math.min(min, 96)) / 96
      const marks = [...hg.map((g) => ({ g, side: 'home' as const })), ...ag.map((g) => ({ g, side: 'away' as const }))]
        .map((m) => ({ ...m, min: goalMinute(m.g) }))
        .filter((m): m is { g: string; side: 'home' | 'away'; min: number } => m.min !== undefined)
        .sort((a, b) => a.min - b.min)
      // Labels close together step out in height, so they never sit on top of each other
      const lastX = { home: -999, away: -999 }
      const level = { home: 0, away: 0 }
      const placed = marks.map((m) => {
        const x = at(m.min)
        level[m.side] = x - lastX[m.side] < 190 ? (level[m.side] + 1) % 3 : 0
        lastX[m.side] = x
        return { ...m, x, lvl: level[m.side] }
      })
      picture = frame(
        <>
          <img src={resultBackground(hc, ac)} width={W} height={H} alt="" style={{ position: 'absolute', left: 0, top: 0 }} />
          {topLine(LIME, 34)}
          <div style={{ position: 'absolute', left: 0, top: 84, width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 26 }}>
            <div style={{ display: 'flex', fontSize: nameSize(home, 40), fontWeight: 800, fontStyle: 'italic' }}>{home.toUpperCase()}</div>
            <Crest name={home} logo={homeLogo} size={100} />
            <div style={{ display: 'flex', fontSize: 96, fontWeight: 800, fontStyle: 'italic', lineHeight: 1, color: LIME }}>
              {hs}–{as}
            </div>
            <Crest name={away} logo={awayLogo} size={100} />
            <div style={{ display: 'flex', fontSize: nameSize(away, 40), fontWeight: 800, fontStyle: 'italic' }}>{away.toUpperCase()}</div>
          </div>
          <div style={{ position: 'absolute', left: x0, top: y - 3, width: x1 - x0, height: 6, borderRadius: 6, background: 'rgba(255,255,255,0.35)', display: 'flex' }} />
          <div style={{ position: 'absolute', left: at(45) - 2, top: y - 16, width: 4, height: 32, background: 'rgba(255,255,255,0.5)', display: 'flex' }} />
          {["0'", "45'", "90'"].map((t, i) => (
            <div key={t} style={{ position: 'absolute', left: at([0, 45, 90][i]) - 30, top: y + 22, width: 60, display: 'flex', justifyContent: 'center', fontFamily: 'DM Sans', fontSize: 18, fontWeight: 500, color: 'rgba(255,255,255,0.55)' }}>
              {t}
            </div>
          ))}
          {/* Stems and dots first, then every name on top (a later goal's stem never runs through an earlier name) */}
          {placed.map((m, i) => {
            const up = m.side === 'home'
            // Below the line, the labels start under the 0'/45'/90' marks
            const stem = (up ? 34 : 58) + m.lvl * 38
            return (
              <div key={`s${i}`} style={{ display: 'flex' }}>
                <div style={{ position: 'absolute', left: m.x - 1, top: up ? y - stem : y + 11, width: 2, height: stem - 11, background: 'rgba(255,255,255,0.4)', display: 'flex' }} />
                <div style={{ position: 'absolute', left: m.x - 11, top: y - 11, width: 22, height: 22, borderRadius: 22, background: up ? LIME : '#fff', border: `3px solid ${BG}`, display: 'flex' }} />
              </div>
            )
          })}
          {placed.map((m, i) => {
            const up = m.side === 'home'
            const stem = (up ? 34 : 58) + m.lvl * 38
            return (
              <div key={`l${i}`} style={{ position: 'absolute', left: m.x - 110, top: up ? y - stem - 32 : y + stem, width: 220, display: 'flex', justifyContent: 'center' }}>
                <div style={{ display: 'flex', padding: '2px 10px', borderRadius: 20, background: 'rgba(17,19,14,0.85)', fontFamily: 'DM Sans', fontSize: 21, fontWeight: 600, color: up ? LIME : '#fff' }}>{m.g}</div>
              </div>
            )
          })}
          <div style={{ position: 'absolute', left: x0, bottom: 34, display: 'flex', gap: 28, fontFamily: 'DM Sans', fontSize: 18, fontWeight: 500, color: 'rgba(255,255,255,0.6)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 14, height: 14, borderRadius: 14, background: LIME, display: 'flex' }} />
              {home}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 14, height: 14, borderRadius: 14, background: '#fff', display: 'flex' }} />
              {away}
            </div>
          </div>
          <Brand />
        </>,
      )
      break
    }
    case 'overskrift': {
      const headline = (input.headline?.trim() || (draw ? `Delt point i ${home} – ${away}` : `${hs > as ? home : away} vandt`)).slice(0, 70)
      picture = frame(
        <>
          <img src={clubBackground('#2c3a0c')} width={W} height={H} alt="" style={{ position: 'absolute', left: 0, top: 0 }} />
          <img src={mOutline('rgba(198,241,53,0.14)', 0.45)} width={900} height={648} alt="" style={{ position: 'absolute', left: 420, top: 110 }} />
          <div style={{ position: 'absolute', left: 80, top: 0, width: 1040, height: 440, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            {top && (
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 22 }}>
                <div style={{ width: 48, height: 6, background: LIME, marginRight: 16, display: 'flex' }} />
                <div style={{ display: 'flex', fontFamily: 'DM Sans', fontSize: 26, fontWeight: 600, color: LIME }}>{top}</div>
              </div>
            )}
            <div style={{ display: 'flex', fontSize: headline.length <= 30 ? 92 : headline.length <= 50 ? 74 : 60, fontWeight: 800, fontStyle: 'italic', lineHeight: 1.02, textShadow: '0 4px 24px rgba(0,0,0,0.5)' }}>{headline.toUpperCase()}</div>
          </div>
          <div style={{ position: 'absolute', left: 80, top: 460, height: 100, display: 'flex', alignItems: 'center', gap: 20, padding: '0 28px', borderRadius: 18, background: 'rgba(0,0,0,0.55)', border: '2px solid rgba(255,255,255,0.12)' }}>
            <Crest name={home} logo={homeLogo} size={70} />
            <div style={{ display: 'flex', fontSize: 32, fontWeight: 800, fontStyle: 'italic' }}>{home.toUpperCase()}</div>
            <div style={{ display: 'flex', fontSize: 58, fontWeight: 800, fontStyle: 'italic', color: LIME, margin: '0 8px' }}>
              {hs}–{as}
            </div>
            <div style={{ display: 'flex', fontSize: 32, fontWeight: 800, fontStyle: 'italic' }}>{away.toUpperCase()}</div>
            <Crest name={away} logo={awayLogo} size={70} />
          </div>
          <Brand />
        </>,
      )
      break
    }
    case 'minimal': {
      picture = frame(
        <>
          <img src={resultBackground('#1a1d14', '#1a1d14')} width={W} height={H} alt="" style={{ position: 'absolute', left: 0, top: 0 }} />
          {topLine(LIME, 44)}
          <div style={{ position: 'absolute', left: 0, top: 96, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ display: 'flex', fontSize: nameSize(home, 64), fontWeight: 800, fontStyle: 'italic', lineHeight: 1 }}>{home.toUpperCase()}</div>
            <div style={{ display: 'flex', fontSize: 250, fontWeight: 800, fontStyle: 'italic', lineHeight: 1, color: LIME, letterSpacing: -4 }}>
              {hs}–{as}
            </div>
            <div style={{ display: 'flex', fontSize: nameSize(away, 64), fontWeight: 800, fontStyle: 'italic', lineHeight: 1 }}>{away.toUpperCase()}</div>
          </div>
          <Brand />
        </>,
      )
      break
    }
    case 'tv': {
      picture = frame(
        <>
          <img src={resultBackground(hc, ac)} width={W} height={H} alt="" style={{ position: 'absolute', left: 0, top: 0 }} />
          <img src={mOutline('rgba(198,241,53,0.10)', 0.45)} width={700} height={504} alt="" style={{ position: 'absolute', left: 250, top: 60 }} />
          {topLine(LIME, 120)}
          <div style={{ position: 'absolute', left: 60, top: 170, width: 1080, height: 120, display: 'flex', alignItems: 'stretch', borderRadius: 16, overflow: 'hidden', boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
            <div style={{ width: 22, background: hc, display: 'flex' }} />
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 18, padding: '0 22px', background: '#f4f5ef', color: BG }}>
              <Crest name={home} logo={homeLogo} size={84} />
              <div style={{ display: 'flex', fontSize: nameSize(home, 40), fontWeight: 800, fontStyle: 'italic' }}>{home.toUpperCase()}</div>
            </div>
            <div style={{ width: 230, display: 'flex', alignItems: 'center', justifyContent: 'center', background: BG, color: LIME, fontSize: 84, fontWeight: 800, fontStyle: 'italic' }}>
              {hs}–{as}
            </div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 18, padding: '0 22px', background: '#f4f5ef', color: BG }}>
              <div style={{ display: 'flex', fontSize: nameSize(away, 40), fontWeight: 800, fontStyle: 'italic' }}>{away.toUpperCase()}</div>
              <Crest name={away} logo={awayLogo} size={84} />
            </div>
            <div style={{ width: 22, background: ac, display: 'flex' }} />
          </div>
          <div style={{ position: 'absolute', left: 540, top: 290, width: 120, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', background: LIME, color: BG, fontFamily: 'DM Sans', fontSize: 21, fontWeight: 700, borderRadius: '0 0 10px 10px' }}>Slut</div>
          <div style={{ position: 'absolute', left: 110, top: 360, width: 400, display: 'flex' }}>
            <Scorers goals={hg} align="flex-start" size={24} />
          </div>
          <div style={{ position: 'absolute', right: 110, top: 360, width: 400, display: 'flex', justifyContent: 'flex-end' }}>
            <Scorers goals={ag} align="flex-end" size={24} />
          </div>
          <Brand />
        </>,
      )
      break
    }
    default:
      picture = frame(
        <>
          <img src={resultBackground(hc, ac)} width={W} height={H} alt="" style={{ position: 'absolute', left: 0, top: 0 }} />
          {topLine()}
          <div style={{ position: 'absolute', left: 0, top: 100, width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
            <ResultSide name={home} logo={homeLogo} goals={hg} />
            <div style={{ width: 300, display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 40 }}>
              <div style={{ display: 'flex', fontFamily: 'DM Sans', fontSize: 22, fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>Slut</div>
              <div style={{ display: 'flex', fontSize: 150, fontWeight: 800, fontStyle: 'italic', lineHeight: 1, color: LIME, textShadow: '0 6px 30px rgba(0,0,0,0.5)' }}>
                {hs}–{as}
              </div>
            </div>
            <ResultSide name={away} logo={awayLogo} goals={ag} />
          </div>
          <Brand />
        </>,
      )
  }
  const res = new ImageResponse(picture as React.ReactElement, { ...OG_SIZE, fonts: ogFonts() })
  return Buffer.from(await res.arrayBuffer())
}

/** The result graphic saved as an upload (in the photo archive as a graphic credited Matchly.dk), ready as the report's picture */
export async function makeResultGraphic(input: ResultInput): Promise<{ url: string }> {
  const png = await resultGraphicPng(input)
  const saved = await saveUpload(png, 1200)
  if (saved.error || !saved.url) throw new Error(saved.error ?? 'Grafikken kunne ikke gemmes')
  try {
    const name = saved.url.replace('/uploads/', '')
    withPhotoDb((db) => {
      const id = registerArticleUpload(db, name)
      db.prepare(`UPDATE photos SET kind = 'grafik', kind_manual = 1, credit = 'Matchly.dk', metadata_done = 1, title = ? WHERE id = ?`).run(`${input.home} ${input.hs}-${input.as} ${input.away}`, id)
    })
  } catch {
    // the article still gets its picture
  }
  return { url: saved.url }
}

// ---------------------------------------------------------------- a text picture

export interface TextInput {
  /** The big text, e.g. "Hjulmand bliver tv-ekspert" */
  title: string
  /** The small lime line above it (optional), e.g. "Conference League på Disney+" */
  top?: string
  /** A line under it (optional) */
  sub?: string
  /** A picture from our own site behind the text ("/uploads/<fil>.webp") */
  bg?: string
}

/** The big text's size by its length, so a long headline still fits three lines */
const titleSize = (t: string) => (t.length <= 28 ? 104 : t.length <= 50 ? 84 : t.length <= 80 ? 66 : 52)

/**
 * The text picture as PNG (1200×630): a headline in Matchly's design for an article with no photo or logo that fits
 * (a person we have no picture of, a general story). The league pages' dark top with the big M, a lime line on top,
 * the headline big and slanted, a line under it, and MATCHLY. at the foot; a photo of our own behind it if chosen.
 */
export async function textGraphicPng(input: TextInput): Promise<Buffer> {
  const title = input.title.trim().slice(0, 120)
  if (!title) throw new Error('Skriv en tekst')
  const top = input.top?.trim().slice(0, 80)
  const sub = input.sub?.trim().slice(0, 140)
  const photo = await photoData(input.bg)
  const res = new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', background: BG, color: '#fff', fontFamily: 'Barlow' }}>
        {photo ? (
          <img src={photo} width={OG_SIZE.width} height={OG_SIZE.height} alt="" style={{ position: 'absolute', left: 0, top: 0, objectFit: 'cover' }} />
        ) : (
          <img src={clubBackground('#2c3a0c')} width={OG_SIZE.width} height={OG_SIZE.height} alt="" style={{ position: 'absolute', left: 0, top: 0 }} />
        )}
        {/* Over a photo: darker towards the left, where the text stands */}
        {photo && <div style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', background: 'linear-gradient(90deg, rgba(17,19,14,0.88) 0%, rgba(17,19,14,0.7) 55%, rgba(17,19,14,0.35) 100%)' }} />}
        <img src={mOutline(photo ? 'rgba(198,241,53,0.16)' : 'rgba(198,241,53,0.14)', 0.45)} width={900} height={648} alt="" style={{ position: 'absolute', left: 420, top: 150 }} />
        <div style={{ position: 'absolute', left: 80, top: 0, width: 1000, height: 540, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          {top && (
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 26 }}>
              <div style={{ display: 'flex', width: 46, height: 6, background: LIME, marginRight: 16 }} />
              <div style={{ display: 'flex', fontSize: 26, fontWeight: 700, letterSpacing: 2, color: LIME }}>{top.toUpperCase()}</div>
            </div>
          )}
          <div style={{ display: 'flex', fontSize: titleSize(title), fontWeight: 800, fontStyle: 'italic', lineHeight: 1.02, textShadow: '0 4px 24px rgba(0,0,0,0.55)' }}>{title.toUpperCase()}</div>
          {sub && <div style={{ display: 'flex', marginTop: 26, fontSize: 32, fontWeight: 600, lineHeight: 1.25, color: 'rgba(255,255,255,0.82)' }}>{sub}</div>}
        </div>
        <div style={{ position: 'absolute', left: 80, bottom: 44, display: 'flex', fontSize: 44, fontWeight: 800, fontStyle: 'italic', lineHeight: 1 }}>
          MATCHLY<span style={{ color: '#ff4a1f' }}>.</span>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts: ogFonts() },
  )
  return Buffer.from(await res.arrayBuffer())
}

/** The text picture saved as an upload (in the photo archive as a graphic credited Matchly.dk), ready as the article's picture */
export async function makeTextGraphic(input: TextInput): Promise<{ url: string }> {
  const png = await textGraphicPng(input)
  const saved = await saveUpload(png, 1200)
  if (saved.error || !saved.url) throw new Error(saved.error ?? 'Billedet kunne ikke gemmes')
  try {
    const name = saved.url.replace('/uploads/', '')
    withPhotoDb((db) => {
      const id = registerArticleUpload(db, name)
      db.prepare(`UPDATE photos SET kind = 'grafik', kind_manual = 1, credit = 'Matchly.dk', metadata_done = 1, title = ? WHERE id = ?`).run(input.title.trim().slice(0, 120), id)
    })
  } catch {
    // the article still gets its picture
  }
  return { url: saved.url }
}
