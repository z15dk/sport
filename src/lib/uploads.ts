import 'server-only'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { cacheDir } from './tsdb'

// Pictures uploaded for articles (featured images and pictures in the text).
// Kept in /opt/scoreline/data/uploads (or UPLOAD_DIR), made at most 1600 px
// wide and saved as WebP, served by /uploads/<name>.webp with a long cache.

export const MAX_UPLOAD_BYTES = 10_000_000
const dir = () => process.env.UPLOAD_DIR ?? path.join(/*turbopackIgnore: true*/ cacheDir(), 'data', 'uploads')

/** The picture's type from its first bytes, so a renamed file cannot pass as a picture */
function isPicture(bytes: Buffer) {
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return true
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true
  if (bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP') return true
  if (bytes.subarray(0, 6).toString('latin1').startsWith('GIF8')) return true
  const head = bytes.subarray(4, 12).toString('latin1')
  return head.startsWith('ftypavif') || head.startsWith('ftypheic') || head.startsWith('ftypmif1')
}

/** `animated`: an animated GIF/WebP keeps its frames (ad banners) */
export async function saveUpload(bytes: Buffer, maxWidth = 1600, animated = false): Promise<{ url?: string; width?: number; height?: number; error?: string }> {
  if (!bytes.length) return { error: 'Filen er tom' }
  if (bytes.length > MAX_UPLOAD_BYTES) return { error: 'Billedet er større end 10 MB' }
  if (!isPicture(bytes)) return { error: 'Filen er ikke et billede (jpg, png, webp, gif eller avif)' }
  try {
    const img = sharp(bytes, { failOn: 'error', animated })
    const out = await (animated ? img : img.rotate()).resize({ width: maxWidth, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true })
    const name = `${createHash('sha256').update(out.data).digest('hex').slice(0, 24)}.webp`
    mkdirSync(dir(), { recursive: true })
    writeFileSync(path.join(dir(), name), out.data)
    return { url: `/uploads/${name}`, width: out.info.width, height: out.info.height }
  } catch {
    return { error: 'Billedet kunne ikke læses – gem det som JPG og prøv igen' }
  }
}

/** An uploaded picture's bytes by its file name */
export function readUpload(name: string): Buffer | undefined {
  if (!/^[a-f0-9]{24}\.webp$/.test(name)) return undefined
  try {
    return readFileSync(path.join(dir(), name))
  } catch {
    return undefined
  }
}
