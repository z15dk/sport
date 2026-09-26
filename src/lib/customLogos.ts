import 'server-only'
import { mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { cacheDir } from './tsdb'

// Club logos uploaded in the admin pages. Kept in /opt/scoreline/data/logos on
// the VPS (outside the release folders, so they survive deploys) and served by
// /api/logo/<slug>. They win over every other logo source.

const TYPES = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  svg: 'image/svg+xml',
} as const
export type LogoExt = keyof typeof TYPES
export const MAX_LOGO_BYTES = 1_000_000

const dir = (): string => process.env.LOGO_DIR ?? path.join(/*turbopackIgnore: true*/ cacheDir(), 'data', 'logos')
const validSlug = (slug: string) => /^[a-z0-9-]{1,130}$/.test(slug)

/** The image type from the file's first bytes, so a renamed file cannot pass as an image */
export function detectType(bytes: Buffer): LogoExt | undefined {
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png'
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg'
  if (bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp'
  const text = bytes.subarray(0, 2000).toString('utf8').trimStart()
  if ((text.startsWith('<svg') || text.startsWith('<?xml')) && /<svg[\s>]/.test(text)) return 'svg'
  return undefined
}

let listed: { at: number; map: Map<string, { file: string; ext: LogoExt; version: number }> } | undefined

/** Uploaded logos by club slug; re-read at most every 5 seconds */
export function customLogos() {
  if (listed && Date.now() - listed.at < 5_000) return listed.map
  const map = new Map<string, { file: string; ext: LogoExt; version: number }>()
  try {
    for (const name of readdirSync(dir())) {
      const m = /^([a-z0-9-]+)\.(png|jpg|webp|svg)$/.exec(name)
      if (!m) continue
      const file = path.join(dir(), name)
      map.set(m[1], { file, ext: m[2] as LogoExt, version: Math.round(statSync(file).mtimeMs) })
    }
  } catch {
    // No uploads yet
  }
  listed = { at: Date.now(), map }
  return map
}

/** URL of a club's uploaded logo (the version makes browsers fetch a new upload) */
export function customLogoUrl(slug: string) {
  const logo = customLogos().get(slug)
  return logo ? `/api/logo/${slug}?v=${logo.version}` : undefined
}

export function saveLogo(slug: string, bytes: Buffer): { error?: string } {
  if (!validSlug(slug)) return { error: 'Ukendt klub' }
  if (bytes.length > MAX_LOGO_BYTES) return { error: 'Filen er større end 1 MB' }
  const ext = detectType(bytes)
  if (!ext) return { error: 'Filen skal være PNG, JPG, WebP eller SVG' }
  mkdirSync(dir(), { recursive: true })
  removeLogo(slug)
  writeFileSync(path.join(dir(), `${slug}.${ext}`), bytes)
  listed = undefined
  return {}
}

export function removeLogo(slug: string) {
  if (!validSlug(slug)) return
  for (const ext of Object.keys(TYPES)) {
    try {
      unlinkSync(path.join(dir(), `${slug}.${ext}`))
    } catch {
      // not there
    }
  }
  listed = undefined
}

export function readLogo(slug: string): { bytes: Buffer; type: string } | undefined {
  if (!validSlug(slug)) return undefined
  const logo = customLogos().get(slug)
  if (!logo) return undefined
  try {
    return { bytes: readFileSync(logo.file), type: TYPES[logo.ext] }
  } catch {
    return undefined
  }
}
