import 'server-only'
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { cacheDir } from './tsdb'
import { AD_PLACEMENT_IDS, type AdPlacementId, type AdSlotConfig, type AdsConfig } from '../data/ads'

// The ads set in /admin/reklamer: per placement an uploaded banner (computer and
// phone) with a link, or an ad network's code, or off; code for every page's head
// and the text for /ads.txt. Kept in /opt/scoreline/data/ads.json (or ADS_FILE)
// and handed to the pages with the data (RealData.ads).

const file = () => process.env.ADS_FILE ?? path.join(/*turbopackIgnore: true*/ cacheDir(), 'data', 'ads.json')

let cache: { mtime: number; config: AdsConfig } = { mtime: -1, config: { slots: {} } }

/** The saved ads and a version that changes with them */
export function adsConfig(): { version: string; config: AdsConfig } {
  let mtime = 0
  try {
    mtime = statSync(file()).mtimeMs
  } catch {
    // nothing saved
  }
  if (mtime !== cache.mtime) {
    let config: AdsConfig = { slots: {} }
    try {
      if (mtime) {
        const saved = JSON.parse(readFileSync(file(), 'utf8')) as Partial<AdsConfig>
        config = { ...saved, slots: saved.slots ?? {} }
      }
    } catch {
      config = { slots: {} }
    }
    cache = { mtime, config }
  }
  return { version: String(Math.round(cache.mtime)), config: cache.config }
}

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined)
const upload = (v: unknown, old?: string) => (v === null || v === '' ? undefined : typeof v === 'string' && /^\/uploads\/[a-f0-9]{24}\.webp$/.test(v) ? v : old)
const link = (v: unknown, old?: string) => {
  const t = text(v, 500)
  if (t === undefined) return old
  if (!t) return undefined
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`)
    return /^https?:$/.test(u.protocol) ? u.toString() : old
  } catch {
    return old
  }
}

/** Changes one placement ({ slot, …fields }) or the head code / ads.txt ({ head }, { adsTxt }) */
export function saveAds(input: Record<string, unknown>): AdsConfig {
  const c = adsConfig().config
  const next: AdsConfig = { ...c, slots: { ...c.slots } }
  const id = input.slot as AdPlacementId
  if (AD_PLACEMENT_IDS.includes(id)) {
    const old: AdSlotConfig = c.slots[id] ?? { mode: 'image' }
    const slot: AdSlotConfig = {
      mode: input.mode === 'off' || input.mode === 'image' || input.mode === 'code' ? input.mode : old.mode,
      desktop: 'desktop' in input ? upload(input.desktop, old.desktop) : old.desktop,
      mobile: 'mobile' in input ? upload(input.mobile, old.mobile) : old.mobile,
      href: 'href' in input ? link(input.href, old.href) : old.href,
      alt: 'alt' in input ? text(input.alt, 120) || undefined : old.alt,
      gambling: typeof input.gambling === 'boolean' ? input.gambling : old.gambling,
      code: 'code' in input ? text(input.code, 20_000) || undefined : old.code,
    }
    next.slots[id] = slot
  }
  if ('head' in input) next.head = text(input.head, 20_000) || undefined
  if ('adsTxt' in input) next.adsTxt = text(input.adsTxt, 50_000) || undefined
  mkdirSync(path.dirname(file()), { recursive: true })
  writeFileSync(`${file()}.tmp`, JSON.stringify(next, null, 2))
  renameSync(`${file()}.tmp`, file())
  return next
}
