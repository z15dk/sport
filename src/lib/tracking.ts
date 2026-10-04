import 'server-only'
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { cacheDir } from './tsdb'

// Google Analytics and Meta Pixel: their ids, set on /admin/indstillinger and kept in
// data/tracking.json. Nothing loads before the visitor says yes in the cookie banner
// (ConsentBanner): statistics → Google Analytics, marketing → Meta Pixel. Without an
// id there is nothing to ask about, and the banner is not shown at all.

export interface TrackingConfig {
  /** Google Analytics 4: G-XXXXXXX */
  ga?: string
  /** Meta Pixel: digits */
  metaPixel?: string
  /** Meta's domain verification code (the content of <meta name="facebook-domain-verification">) */
  metaVerify?: string
  /** Bing Webmaster Tools' verification code (the content of <meta name="msvalidate.01">) */
  bingVerify?: string
  /** Who is responsible for the data (GDPR art. 13), shown on /privatliv */
  owner?: Owner
}

export interface Owner {
  name?: string
  cvr?: string
  address?: string
  email?: string
}

const file = () => process.env.TRACKING_FILE ?? path.join(/*turbopackIgnore: true*/ cacheDir(), 'data', 'tracking.json')
let cache: { mtime: number; config: TrackingConfig } = { mtime: -1, config: {} }

export function trackingConfig(): TrackingConfig {
  let mtime = 0
  try {
    mtime = statSync(file()).mtimeMs
  } catch {
    // nothing saved
  }
  if (mtime !== cache.mtime) {
    let config: TrackingConfig = {}
    try {
      if (mtime) config = clean(JSON.parse(readFileSync(file(), 'utf8')) as Record<string, unknown>)
    } catch {
      config = {}
    }
    cache = { mtime, config }
  }
  return cache.config
}

const GA = /^G-[A-Z0-9]{4,16}$/
const PIXEL = /^\d{8,20}$/
const VERIFY = /^[a-z0-9]{10,60}$/

/** The code alone, also when the whole meta tag Meta shows is pasted */
const verifyCode = (v: unknown) => {
  const t = String(v ?? '').trim()
  return (/content=["']([^"']+)["']/.exec(t)?.[1] ?? t).trim().toLowerCase()
}

/** Bing's code keeps its capitals */
const BING = /^[A-Za-z0-9]{16,64}$/
const bingCode = (v: unknown) => {
  const t = String(v ?? '').trim()
  return (/content=["']([^"']+)["']/.exec(t)?.[1] ?? t).trim()
}

const text = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n)

function cleanOwner(v: unknown): Owner | undefined {
  const o = (v ?? {}) as Record<string, unknown>
  const owner: Owner = { name: text(o.name, 120), cvr: text(o.cvr, 20), address: text(o.address, 200), email: text(o.email, 120) }
  const kept = Object.fromEntries(Object.entries(owner).filter(([, x]) => x)) as Owner
  return Object.keys(kept).length ? kept : undefined
}

function clean(v: Record<string, unknown>): TrackingConfig {
  const ga = String(v.ga ?? '').trim().toUpperCase()
  const pixel = String(v.metaPixel ?? '').trim()
  const owner = cleanOwner(v.owner)
  const verify = verifyCode(v.metaVerify)
  const bing = bingCode(v.bingVerify)
  return {
    ...(GA.test(ga) && { ga }),
    ...(PIXEL.test(pixel) && { metaPixel: pixel }),
    ...(VERIFY.test(verify) && { metaVerify: verify }),
    ...(BING.test(bing) && { bingVerify: bing }),
    ...(owner && { owner }),
  }
}

/** Saves the ids; an empty field turns that service off */
export function saveTracking(v: { ga?: unknown; metaPixel?: unknown; metaVerify?: unknown; bingVerify?: unknown; owner?: unknown }): { error?: string } {
  const ga = String(v.ga ?? '').trim().toUpperCase()
  const pixel = String(v.metaPixel ?? '').trim()
  if (ga && !GA.test(ga)) return { error: 'Google Analytics-id ser sådan ud: G-ABC123XYZ' }
  if (pixel && !PIXEL.test(pixel)) return { error: 'Meta Pixel-id er kun tal (fx 123456789012345)' }
  const verify = verifyCode(v.metaVerify)
  if (verify && !VERIFY.test(verify)) return { error: 'Metas bekræftelseskode ser forkert ud – indsæt koden eller hele meta-tagget fra Meta' }
  const bing = bingCode(v.bingVerify)
  if (bing && !BING.test(bing)) return { error: 'Bings bekræftelseskode ser forkert ud – indsæt koden eller hele meta-tagget fra Bing Webmaster Tools' }
  const email = text((v.owner as Record<string, unknown> | undefined)?.email, 120)
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Kontakt-mailen ser forkert ud' }
  mkdirSync(path.dirname(file()), { recursive: true })
  writeFileSync(`${file()}.tmp`, JSON.stringify(clean({ ga, metaPixel: pixel, metaVerify: verify, bingVerify: bing, owner: v.owner }), null, 2))
  renameSync(`${file()}.tmp`, file())
  cache = { mtime: -1, config: {} }
  return {}
}
