import { unlinkSync } from 'node:fs'
import path from 'node:path'
import type { PhotoConfig } from './config.ts'
import { logStep, nowIso, transaction, type Db } from './db.ts'
import type { DriveClient } from './drive.ts'
import { isUploadPhoto, unpublishPhoto } from './articles.ts'

// Deletes a photo everywhere: the original and the web version go to the shared
// drive's trash (Google empties it after 30 days), the thumbnail and cached copy
// are removed from the server, the tags are deleted and the row stays as a record
// (status slettet), so the file is never taken in again. Used when a loan runs out
// and when photos are deleted in admin. Throws when Drive does not answer – the
// photo is then left as it is. A photo used in articles is taken out of them.
export async function deletePhotoEverywhere(db: Db, drive: DriveClient, cfg: PhotoConfig, id: number, reason: string) {
  const p = db.prepare('SELECT drive_id, web_drive_id, status FROM photos WHERE id = ?').get(id)
  if (!p || p.status === 'slettet') return
  // Photos uploaded in the article editor have no Drive file
  if (!isUploadPhoto(String(p.drive_id))) await drive.trash(String(p.drive_id))
  if (p.web_drive_id) await drive.trash(String(p.web_drive_id))
  // Out of every article that shows it, and its public copies deleted
  const pub = unpublishPhoto(db, cfg, id)
  if (pub.articles) reason = `${reason}; fjernet fra ${pub.articles} artikel${pub.articles === 1 ? '' : 'er'}`
  for (const f of [path.join(cfg.thumbDir, `${id}.webp`), path.join(cfg.cacheDir, `${id}.webp`)]) {
    try {
      unlinkSync(f)
    } catch {
      // Not there
    }
  }
  transaction(db, () => {
    db.prepare('DELETE FROM tags WHERE photo_id = ?').run(id)
    db.prepare(`UPDATE photos SET status = 'slettet', deleted_at = ?, deleted_reason = ?, vision_json = NULL, web_drive_id = NULL, review = 0, lease_until = NULL WHERE id = ?`).run(nowIso(), reason, id)
  })
  logStep(db, id, 'slettet', true, undefined, reason)
}
