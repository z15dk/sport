import 'server-only'
import { existsSync, mkdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { photoConfig } from './config.ts'
import { FORMATS, cropRect, type SomeFormat } from './crop.ts'
import { openPhotoDb, type Db } from './db.ts'
import { driveClient } from './drive.ts'

// The admin pages' access to the photos (Next only; the job has its own).
// Thumbnails are on the server; the 1600 px web version is read from the small
// cache or fetched from Drive's _web folder and cached.

export function withPhotoDb<T>(fn: (db: Db) => T): T {
  const db = openPhotoDb(photoConfig().db)
  try {
    return fn(db)
  } finally {
    db.close()
  }
}

export async function photoImage(id: number, variant: 'thumb' | 'web'): Promise<Buffer | undefined> {
  const cfg = photoConfig()
  if (variant === 'thumb') {
    const file = path.join(/*turbopackIgnore: true*/ cfg.thumbDir, `${id}.webp`)
    return existsSync(file) ? readFileSync(file) : undefined
  }
  const cached = path.join(/*turbopackIgnore: true*/ cfg.cacheDir, `${id}.webp`)
  if (existsSync(cached)) {
    // Mark as recently used, so the cache keeps it
    const now = new Date()
    try {
      utimesSync(cached, now, now)
    } catch {
      // Read-only is fine
    }
    return readFileSync(cached)
  }
  const webId = withPhotoDb((db) => db.prepare('SELECT web_drive_id FROM photos WHERE id = ?').get(id)?.web_drive_id)
  if (!webId || !cfg.serviceAccountFile || !cfg.driveId) return undefined
  const bytes = await driveClient(cfg.serviceAccountFile, cfg.driveId).download(String(webId))
  mkdirSync(cfg.cacheDir, { recursive: true })
  writeFileSync(cached, bytes)
  return bytes
}

/** A JPEG for social media (Instagram takes no WebP), cut around the chosen player */
export async function someImage(id: number, format: SomeFormat, tagId?: number): Promise<{ jpeg: Buffer; name: string } | undefined> {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Copenhagen' })
  const rights = withPhotoDb((db) => db.prepare('SELECT status, license_until FROM photos WHERE id = ?').get(id))
  // A borrowed photo past its loan may not be used any more (it is deleted at the next run)
  if (!rights || rights.status === 'slettet' || (rights.license_until && String(rights.license_until) < today)) return undefined
  const web = await photoImage(id, 'web')
  if (!web) return undefined
  const { box, label } = withPhotoDb((db) => {
    const t = tagId ? db.prepare('SELECT number, player_name, ymin, xmin, ymax, xmax FROM tags WHERE id = ? AND photo_id = ?').get(tagId, id) : undefined
    const p = db.prepare('SELECT club, match_date FROM photos WHERE id = ?').get(id)
    return {
      box: t && t.ymin != null ? ([Number(t.ymin), Number(t.xmin), Number(t.ymax), Number(t.xmax)] as [number, number, number, number]) : undefined,
      label: [p?.club, p?.match_date, t ? (t.player_name ?? `nr-${t.number}`) : undefined].filter(Boolean).join('_'),
    }
  })
  const meta = await sharp(web).metadata()
  const target = FORMATS[format]
  const r = cropRect(meta.width ?? 0, meta.height ?? 0, target.width, target.height, box)
  const jpeg = await sharp(web).extract(r).resize(target.width, target.height, { kernel: 'lanczos3' }).jpeg({ quality: 90, mozjpeg: true }).toBuffer()
  const slug = label
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'oe')
    .replace(/å/g, 'aa')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return { jpeg, name: `${slug || `billede-${id}`}_${format}.jpg` }
}
