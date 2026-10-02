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

function clean(v: Record<string, unknown>): TrackingConfig {
  const ga = String(v.ga ?? '').trim().toUpperCase()
  const pixel = String(v.metaPixel ?? '').trim()
  return { ...(GA.test(ga) && { ga }), ...(PIXEL.test(pixel) && { metaPixel: pixel }) }
}

/** Saves the ids; an empty field turns that service off */
export function saveTracking(v: { ga?: unknown; metaPixel?: unknown }): { error?: string } {
  const ga = String(v.ga ?? '').trim().toUpperCase()
  const pixel = String(v.metaPixel ?? '').trim()
  if (ga && !GA.test(ga)) return { error: 'Google Analytics-id ser sådan ud: G-ABC123XYZ' }
  if (pixel && !PIXEL.test(pixel)) return { error: 'Meta Pixel-id er kun tal (fx 123456789012345)' }
  mkdirSync(path.dirname(file()), { recursive: true })
  writeFileSync(`${file()}.tmp`, JSON.stringify(clean({ ga, metaPixel: pixel }), null, 2))
  renameSync(`${file()}.tmp`, file())
  cache = { mtime: -1, config: {} }
  return {}
}
