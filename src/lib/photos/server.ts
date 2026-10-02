import 'server-only'
import { existsSync, mkdirSync, readFileSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { ensurePhotoDirs, photoConfig } from './config.ts'
import sharp from 'sharp'
import type { SomeFormat } from './crop.ts'
import { openPhotoDb, type Db } from './db.ts'
import { createHash } from 'node:crypto'
import { bestPhotos, openShare, runningSince } from './store.ts'
import { driveClient } from './drive.ts'
import { deletePhotoEverywhere } from './remove.ts'
import { cropToJpeg } from './some.ts'
import { safeName, zip } from './zip.ts'

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
  const row = withPhotoDb((db) => db.prepare('SELECT web_drive_id, drive_id FROM photos WHERE id = ?').get(id))
  // A picture from the article editor: its public file is the web version
  if (row && String(row.drive_id).startsWith('upload:')) {
    const f = path.join(/*turbopackIgnore: true*/ cfg.uploadDir, String(row.drive_id).slice('upload:'.length))
    return existsSync(f) ? readFileSync(f) : undefined
  }
  const webId = row?.web_drive_id
  if (!webId || !cfg.serviceAccountFile || !cfg.driveId) return undefined
  const bytes = await driveClient(cfg.serviceAccountFile, cfg.driveId).download(String(webId))
  ensurePhotoDirs(cfg)
  writeFileSync(cached, bytes, { mode: 0o600 })
  return bytes
}

/** The original from Drive while it is still there (before it is archived on the NAS); undefined when it is gone */
async function originalFromDrive(id: number): Promise<Buffer | undefined> {
  const cfg = photoConfig()
  const row = withPhotoDb((db) => db.prepare('SELECT drive_id, status, archive_state FROM photos WHERE id = ?').get(id))
  if (!row || !cfg.serviceAccountFile || !cfg.driveId || row.status === 'arkiveret' || row.archive_state === 'slettet_fra_drive' || String(row.drive_id).startsWith('upload:')) return undefined
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

/** Asks systemd to run the job now (scoreline-photos-sync.path watches the file); no-op while one is asked for or running */
export function requestSync(): { started: boolean; reason?: string } {
  const cfg = photoConfig()
  if (withPhotoDb((db) => runningSince(db))) return { started: false, reason: 'Jobbet kører allerede' }
  if (existsSync(cfg.syncRequestFile)) {
    // Not picked up within two minutes: systemd is not watching (the path unit is not installed)
    if (Date.now() - statSync(cfg.syncRequestFile).mtimeMs > 120_000) return { started: false, reason: 'Sync blev bestilt, men jobbet startede ikke – er scoreline-photos-sync.path installeret? (se driftsvejledningen)' }
    return { started: false, reason: 'Sync er allerede bestilt' }
  }
  ensurePhotoDirs(cfg)
  writeFileSync(cfg.syncRequestFile, new Date().toISOString(), { mode: 0o600 })
  return { started: true }
}

export const syncRequested = () => existsSync(photoConfig().syncRequestFile)

/** Deletes photos everywhere (Drive trash, server copies, tags); returns how many went and the errors */
export async function deletePhotos(ids: number[], reason = 'slettet i admin'): Promise<{ deleted: number; errors: string[] }> {
  const cfg = photoConfig()
  if (!cfg.serviceAccountFile || !cfg.driveId) return { deleted: 0, errors: ['Drive er ikke sat op'] }
  const drive = driveClient(cfg.serviceAccountFile, cfg.driveId)
  const db = openPhotoDb(cfg.db)
  let deleted = 0
  const errors: string[] = []
  try {
    for (const id of ids) {
      try {
        await deletePhotoEverywhere(db, drive, cfg, id, reason)
        deleted++
      } catch (e) {
        errors.push(`#${id}: ${(e as Error).message}`)
      }
    }
  } finally {
    db.close()
  }
  return { deleted, errors }
}

/** "Best of the match": the N best safe photos cut to one format, as a ZIP with a credits file */
export async function bestZip(clubId: string, date: string, opponentId: string | null, format: SomeFormat, n = 10): Promise<{ zip: Buffer; name: string } | undefined> {
  const cfg = photoConfig()
  const picks = withPhotoDb((db) => bestPhotos(db, clubId, date, opponentId, n))
  if (!picks.length) return undefined
  const files: { name: string; data: Buffer }[] = []
  const credits: string[] = []
  for (const [i, p] of picks.entries()) {
    const out = await someImage(p.id, format)
    if (!out) continue
    const who = p.players.length ? `_${p.players.slice(0, 2).join('_')}` : p.situation ? `_${p.situation}` : ''
    const name = `${String(i + 1).padStart(2, '0')}${safeName(who)}.jpg`
    files.push({ name, data: out.jpeg })
    credits.push(`${name}: Foto: ${p.credit ?? cfg.defaultCredit}`)
  }
  if (!files.length) return undefined
  files.push({ name: 'kreditering.txt', data: Buffer.from(`${credits.join('\n')}\n`) })
  return { zip: zip(files), name: `${safeName(`${clubId}_${date}_bedste`)}_${format}.zip` }
}

/** A photo from an open share link: thumbnail (WebP) or a JPEG of the 1600 px version to download */
export async function sharedImage(token: string, photoId: number, variant: 'thumb' | 'jpg'): Promise<{ bytes: Buffer; type: string; name?: string } | undefined> {
  const share = withPhotoDb((db) => openShare(db, token))
  const photo = share?.photos.find((p) => p.id === photoId)
  if (!share || share.expired || !photo) return undefined
  if (variant === 'thumb') {
    const bytes = await photoImage(photoId, 'thumb')
    return bytes && { bytes, type: 'image/webp' }
  }
  const web = await photoImage(photoId, 'web')
  if (!web) return undefined
  const bytes = await sharp(web).jpeg({ quality: 90, mozjpeg: true }).toBuffer()
  return { bytes, type: 'image/jpeg', name: `${safeName(`${photo.club ?? 'matchly'}_${photo.matchDate ?? ''}_${photo.id}`)}.jpg` }
}

/** All photos of an open share link as one ZIP of JPEGs */
export async function sharedZip(token: string): Promise<{ zip: Buffer; name: string } | undefined> {
  const share = withPhotoDb((db) => openShare(db, token))
  if (!share || share.expired || !share.photos.length) return undefined
  const files: { name: string; data: Buffer }[] = []
  for (const p of share.photos) {
    const img = await sharedImage(token, p.id, 'jpg')
    if (img?.name) files.push({ name: img.name, data: img.bytes })
  }
  files.push({ name: 'kreditering.txt', data: Buffer.from(`Foto: ${photoConfig().defaultCredit}\n`) })
  return { zip: zip(files), name: `${safeName(share.title) || 'billeder'}.zip` }
}

/**
 * A photo from the archive put into an article: a public copy in /uploads (the 1600 px
 * WebP, no metadata), remembered so an expired loan or a deleted photo is taken out of
 * the article again. Never for a loan that has run out.
 */
export async function publishForArticle(photoId: number): Promise<{ url?: string; credit?: string; borrowed?: boolean; error?: string }> {
  const cfg = photoConfig()
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Copenhagen' })
  const p = withPhotoDb((db) => db.prepare('SELECT status, credit, license_until, drive_id FROM photos WHERE id = ?').get(photoId))
  if (!p || p.status === 'slettet' || p.status === 'fejl') return { error: 'Billedet findes ikke' }
  if (p.license_until && String(p.license_until) < today) return { error: 'Låneperioden er udløbet – billedet må ikke bruges' }
  const web = await photoImage(photoId, 'web')
  if (!web) return { error: 'Billedet er ikke behandlet endnu – tryk Sync eller vent til natkørslen' }
  const name = `${createHash('sha256').update(web).digest('hex').slice(0, 24)}.webp`
  if (!String(p.drive_id).startsWith('upload:')) {
    mkdirSync(cfg.uploadDir, { recursive: true })
    const file = path.join(/*turbopackIgnore: true*/ cfg.uploadDir, name)
    if (!existsSync(file)) writeFileSync(file, web)
    withPhotoDb((db) => db.prepare('INSERT OR IGNORE INTO article_images (upload_name, photo_id, created_at) VALUES (?, ?, ?)').run(name, photoId, new Date().toISOString()))
  }
  const url = String(p.drive_id).startsWith('upload:') ? `/uploads/${String(p.drive_id).slice('upload:'.length)}` : `/uploads/${name}`
  return { url, credit: (p.credit as string) ?? cfg.defaultCredit, borrowed: !!p.license_until }
}
