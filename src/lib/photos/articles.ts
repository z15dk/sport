import { existsSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import type { PhotoConfig } from './config.ts'
import { openPhotoDb, type Db } from './db.ts'

// The link between the photo archive and the articles: a public copy in /uploads
// (uploaded in the editor, or taken from the archive) belongs to one photo. When the
// photo goes (a loan runs out, or it is deleted in admin), its copies are taken out
// of every article – the featured image is cleared and the <img> removed from the
// text – and the files are deleted. articles.db is opened directly, as the job runs
// outside Next.

type Sqlite = { DatabaseSync: new (file: string) => { exec(sql: string): void; prepare(sql: string): { all(...p: unknown[]): Record<string, unknown>[]; run(...p: unknown[]): unknown }; close(): void } }

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The article HTML without the picture (and a credit line right after it) */
export function stripPicture(html: string, url: string): string {
  const img = new RegExp(`<img[^>]*src="${esc(url)}"[^>]*>`, 'g')
  return html
    .replace(new RegExp(`${img.source}\\s*<p><em>Foto:[^<]*</em></p>`, 'g'), '')
    .replace(img, '')
    .replace(/<p>\s*<\/p>/g, '')
}

export function removeFromArticles(cfg: PhotoConfig, uploadNames: string[]): number {
  if (!uploadNames.length || !existsSync(cfg.articlesDb)) return 0
  const lib = process.getBuiltinModule?.('node:sqlite') as Sqlite | undefined
  if (!lib) return 0
  const adb = new lib.DatabaseSync(cfg.articlesDb)
  let changed = 0
  try {
    adb.exec('PRAGMA busy_timeout = 5000')
    for (const name of uploadNames) {
      const url = `/uploads/${name}`
      for (const a of adb.prepare(`SELECT id, content, featured_image FROM articles WHERE content LIKE ? OR featured_image = ?`).all(`%${url}%`, url)) {
        const featured = a.featured_image === url
        adb.prepare(`UPDATE articles SET content = ?, featured_image = ?, featured_alt = CASE WHEN ? THEN NULL ELSE featured_alt END, updated_at = ? WHERE id = ?`).run(
          stripPicture(String(a.content ?? ''), url),
          featured ? null : a.featured_image,
          featured ? 1 : 0,
          new Date().toISOString(),
          a.id,
        )
        changed++
      }
    }
  } finally {
    adb.close()
  }
  return changed
}

/** The public copies of a photo: out of the articles, files deleted, links forgotten */
export function unpublishPhoto(db: Db, cfg: PhotoConfig, photoId: number): { articles: number; files: number } {
  const names = db.prepare('SELECT upload_name FROM article_images WHERE photo_id = ?').all(photoId).map((r) => String(r.upload_name))
  const articles = removeFromArticles(cfg, names)
  let files = 0
  for (const n of names) {
    const f = path.join(cfg.uploadDir, n)
    try {
      unlinkSync(f)
      files++
    } catch {
      // Gone already
    }
  }
  db.prepare('DELETE FROM article_images WHERE photo_id = ?').run(photoId)
  return { articles, files }
}

/** Every /uploads picture used by an article (featured image or in the text) */
export function articleImageNames(cfg: PhotoConfig): string[] {
  if (!existsSync(cfg.articlesDb)) return []
  const lib = process.getBuiltinModule?.('node:sqlite') as Sqlite | undefined
  if (!lib) return []
  const adb = new lib.DatabaseSync(cfg.articlesDb)
  try {
    const names = new Set<string>()
    for (const a of adb.prepare('SELECT content, featured_image FROM articles').all()) {
      for (const m of `${String(a.featured_image ?? '')} ${String(a.content ?? '')}`.matchAll(/\/uploads\/([a-f0-9]{24}\.webp)/g)) names.add(m[1])
    }
    return [...names]
  } finally {
    adb.close()
  }
}

export const isUploadPhoto = (driveId: string) => driveId.startsWith('upload:')
export { openPhotoDb }
