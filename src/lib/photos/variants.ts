import exifReader from 'exif-reader'
import sharp from 'sharp'
import { measure } from './quality.ts'

// The versions of a photo, made from one decode of the original:
//  - web: WebP 1600 px (kept in Drive's _web folder, cached on the server)
//  - thumb: WebP 480 px, quality 50 (kept on the server; only ever shown small)
//  - ai: JPEG 1600 px, quality 90 (sent to the AI, not kept)
// The orientation from EXIF is applied, and no metadata is written to any
// version (sharp drops EXIF/GPS unless asked to keep it).

// One photo at a time on one thread, and no cache held between photos
sharp.concurrency(1)
sharp.cache(false)

export const MAX_ORIGINAL_BYTES = 80_000_000

export interface Variants {
  web: Buffer
  thumb: Buffer
  ai: Buffer
  width: number
  height: number
  /** The camera's time (DateTimeOriginal) as local time "yyyy-mm-ddThh:mm:ss", when the photo has it */
  takenAt?: string
  sharpness: number
  dhash: string
}

export async function makeVariants(original: Buffer): Promise<Variants> {
  const meta = await sharp(original, { failOn: 'truncated' }).metadata()
  const takenAt = exifDate(meta.exif)
  const { data, info } = await sharp(original, { failOn: 'truncated', sequentialRead: true })
    .rotate()
    .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const raw = { raw: { width: info.width, height: info.height, channels: info.channels } }
  const measures = await measure({ data, width: info.width, height: info.height, channels: info.channels })
  const [web, thumb, ai] = await Promise.all([
    sharp(data, raw).webp({ quality: 82 }).toBuffer(),
    sharp(data, raw).resize(480, 480, { fit: 'inside' }).webp({ quality: 50 }).toBuffer(),
    sharp(data, raw).jpeg({ quality: 90 }).toBuffer(),
  ])
  // The size of the upright original (width/height swap for 90° orientations)
  const turned = (meta.orientation ?? 1) >= 5
  const width = (turned ? meta.height : meta.width) ?? info.width
  const height = (turned ? meta.width : meta.height) ?? info.height
  return { web, thumb, ai, width, height, takenAt, ...measures }
}

function exifDate(exif: Buffer | undefined): string | undefined {
  if (!exif) return undefined
  try {
    const e = exifReader(exif) as { Photo?: { DateTimeOriginal?: Date; DateTimeDigitized?: Date }; Image?: { DateTime?: Date } }
    const d = e.Photo?.DateTimeOriginal ?? e.Photo?.DateTimeDigitized ?? e.Image?.DateTime
    // exif-reader reads the camera's local time as if it were UTC
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 19) : undefined
  } catch {
    return undefined
  }
}
