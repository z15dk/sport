import 'server-only'
import { existsSync, mkdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { photoConfig } from './config.ts'
import type { SomeFormat } from './crop.ts'
import { openPhotoDb, type Db } from './db.ts'
import { driveClient } from './drive.ts'
import { cropToJpeg } from './some.ts'

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

/** The original from Drive while it is still there (before it is archived on the NAS); undefined when it is gone */
async function originalFromDrive(id: number): Promise<Buffer | undefined> {
  const cfg = photoConfig()
  const row = withPhotoDb((db) => db.prepare('SELECT drive_id, status, archive_state FROM photos WHERE id = ?').get(id))
  if (!row || !cfg.serviceAccountFile || !cfg.driveId || row.status === 'arkiveret' || row.archive_state === 'slettet_fra_drive') return undefined
  try {
    return await driveClient(cfg.serviceAccountFile, cfg.driveId).download(String(row.drive_id))
  } catch {
    // Moved, archived or Drive not answering: the web version will do
    return undefined
  }
}

/** A JPEG for social media (Instagram takes no WebP), cut around the chosen player – from the original when possible */
export async function someImage(id: number, format: SomeFormat, tagId?: number): Promise<{ jpeg: Buffer; name: string; source: 'original' | 'web' } | undefined> {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Copenhagen' })
  const info = withPhotoDb((db) => {
    const p = db.prepare('SELECT status, license_until, club, match_date FROM photos WHERE id = ?').get(id)
    const t = tagId ? db.prepare('SELECT number, player_name, ymin, xmin, ymax, xmax FROM tags WHERE id = ? AND photo_id = ?').get(tagId, id) : undefined
    return { p, t }
  })
  const { p, t } = info
  // A borrowed photo past its loan may not be used any more (it is deleted at the next run)
  if (!p || p.status === 'slettet' || (p.license_until && String(p.license_until) < today)) return undefined
  const box = t && t.ymin != null ? ([Number(t.ymin), Number(t.xmin), Number(t.ymax), Number(t.xmax)] as [number, number, number, number]) : undefined
  let jpeg: Buffer | undefined
  let source: 'original' | 'web' = 'original'
  const original = await originalFromDrive(id)
  if (original) {
    try {
      jpeg = await cropToJpeg(original, format, box)
    } catch {
      jpeg = undefined
    }
  }
  if (!jpeg) {
    const web = await photoImage(id, 'web')
    if (!web) return undefined
    jpeg = await cropToJpeg(web, format, box)
    source = 'web'
  }
  const label = [p.club, p.match_date, t ? (t.player_name ?? `nr-${t.number}`) : undefined].filter(Boolean).join('_')
  const slug = String(label)
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'oe')
    .replace(/å/g, 'aa')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return { jpeg, name: `${slug || `billede-${id}`}_${format}.jpg`, source }
}
