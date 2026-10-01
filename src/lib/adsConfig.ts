import 'server-only'
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { cacheDir } from './tsdb'
import { AD_PLACEMENT_IDS, MAX_CREATIVES, type AdBanner, type AdPlacementId, type AdSlotConfig, type AdsConfig } from '../data/ads'

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

/** The fields of one banner, changed by those in the input */
function creative(input: Record<string, unknown>, old: AdBanner): AdBanner {
  return {
    kind: input.kind === 'code' || input.kind === 'image' ? input.kind : old.kind,
    code: 'code' in input ? text(input.code, 20_000) || undefined : old.code,
    desktop: 'desktop' in input ? upload(input.desktop, old.desktop) : old.desktop,
    mobile: 'mobile' in input ? upload(input.mobile, old.mobile) : old.mobile,
    href: 'href' in input ? link(input.href, old.href) : old.href,
    alt: 'alt' in input ? text(input.alt, 120) || undefined : old.alt,
    gambling: typeof input.gambling === 'boolean' ? input.gambling : old.gambling,
  }
}

/**
 * Changes one placement ({ slot, …fields }; with `creative: 1–3` one of the banners shown in turn
 * after the first, `removeCreative: n` removes it) or the head code / ads.txt ({ head }, { adsTxt })
 */
export function saveAds(input: Record<string, unknown>): AdsConfig {
  const c = adsConfig().config
  const next: AdsConfig = { ...c, slots: { ...c.slots } }
  const id = input.slot as AdPlacementId
  if (AD_PLACEMENT_IDS.includes(id)) {
    const old: AdSlotConfig = c.slots[id] ?? { mode: 'image' }
    // The first banner's kind is the placement's mode (picture or code)
    const asked = input.mode ?? (Number(input.creative ?? 0) === 0 ? input.kind : undefined)
    const mode = asked === 'off' || asked === 'image' || asked === 'code' ? asked : old.mode
    const n = Number(input.creative ?? 0)
    const remove = Number(input.removeCreative ?? 0)
    let more = [...(old.more ?? [])]
    if (remove >= 1 && remove < MAX_CREATIVES) more.splice(remove - 1, 1)
    let slot: AdSlotConfig
    if (n >= 1 && n < MAX_CREATIVES) {
      // One of the banners after the first (a new one goes last)
      const at = Math.min(n - 1, more.length)
      more[at] = creative(input, more[at] ?? {})
      slot = { ...old, mode }
    } else {
      // The first banner's kind is the placement's mode
      const first: AdBanner = remove ? {} : creative(input, old)
      delete first.kind
      slot = { ...old, ...first, mode }
    }
    more = more.filter((m) => m.desktop || m.mobile || m.href || m.code)
    slot.more = more.length ? more : undefined
    next.slots[id] = slot
  }
  if ('head' in input) next.head = text(input.head, 20_000) || undefined
  if ('adsTxt' in input) next.adsTxt = text(input.adsTxt, 50_000) || undefined
  mkdirSync(path.dirname(file()), { recursive: true })
  writeFileSync(`${file()}.tmp`, JSON.stringify(next, null, 2))
  renameSync(`${file()}.tmp`, file())
  return next
}
