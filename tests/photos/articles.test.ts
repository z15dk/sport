import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { removeFromArticles, stripPicture, unpublishPhoto } from '../../src/lib/photos/articles.ts'
import { photoConfig } from '../../src/lib/photos/config.ts'
import { openPhotoDb } from '../../src/lib/photos/db.ts'
import { getPhoto, registerArticleUpload, setArticleMetadata } from '../../src/lib/photos/store.ts'

const URL1 = '/uploads/aaaaaaaaaaaaaaaaaaaaaaaa.webp'

test('billedet og dets kreditering tages ud af artiklens tekst', () => {
  const html = `<p>Før</p><img src="${URL1}" alt="Jubel"><p><em>Foto: Jens Hansen</em></p><p>Efter</p><img src="/uploads/bbbbbbbbbbbbbbbbbbbbbbbb.webp" alt="">`
  assert.equal(stripPicture(html, URL1), '<p>Før</p><p>Efter</p><img src="/uploads/bbbbbbbbbbbbbbbbbbbbbbbb.webp" alt="">')
})

test('upload fra editoren: i arkivet, metadata, og ud af artiklerne når det slettes', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'art-'))
  Object.assign(process.env, { PHOTOS_DB: path.join(dir, 'b.db'), UPLOAD_DIR: path.join(dir, 'uploads'), ARTICLES_DB: path.join(dir, 'articles.db') })
  const cfg = photoConfig()
  mkdirSync(cfg.uploadDir)
  writeFileSync(path.join(cfg.uploadDir, 'aaaaaaaaaaaaaaaaaaaaaaaa.webp'), 'x')
  const lib = process.getBuiltinModule('node:sqlite') as { DatabaseSync: new (f: string) => { exec(s: string): void; prepare(s: string): { get(...p: unknown[]): Record<string, unknown> | undefined } ; close(): void } }
  const adb = new lib.DatabaseSync(cfg.articlesDb)
  adb.exec(`CREATE TABLE articles (id INTEGER PRIMARY KEY, content TEXT, featured_image TEXT, featured_alt TEXT, updated_at TEXT)`)
  adb.exec(`INSERT INTO articles VALUES (1, '<p>a</p><img src="${URL1}" alt="x">', NULL, NULL, ''), (2, '<p>b</p>', '${URL1}', 'alt', ''), (3, '<p>c</p>', NULL, NULL, '')`)
  adb.close()

  const db = openPhotoDb(cfg.db)
  db.exec(`INSERT INTO clubs (id, name, colors, updated_at) VALUES ('brabrand', 'Brabrand', '["blå"]', 'x'), ('skive', 'Skive', '["gul","blå"]', 'x')`)
  const id = registerArticleUpload(db, 'aaaaaaaaaaaaaaaaaaaaaaaa.webp')
  assert.equal(registerArticleUpload(db, 'aaaaaaaaaaaaaaaaaaaaaaaa.webp'), id)
  let p = getPhoto(db, id)!.photo
  assert.equal(p.status, 'ny')
  assert.deepEqual(p.reviewReasons, ['mangler metadata'])
  assert.match(setArticleMetadata(db, id, { credit: '', licenseUntil: '2026-12-01' }, 0.8).error!, /lånt af/)
  assert.deepEqual(setArticleMetadata(db, id, { credit: 'Foto: Jens', licenseUntil: '2026-12-01', clubId: 'brabrand', opponentId: 'skive', date: '2026-08-01' }, 0.8), {})
  p = getPhoto(db, id)!.photo
  assert.equal(p.clubId, 'brabrand')
  assert.equal(p.licenseUntil, '2026-12-01')
  assert.deepEqual(p.reviewReasons, [])

  const r = unpublishPhoto(db, cfg, id)
  assert.deepEqual(r, { articles: 2, files: 1 })
  assert.equal(existsSync(path.join(cfg.uploadDir, 'aaaaaaaaaaaaaaaaaaaaaaaa.webp')), false)
  const adb2 = new lib.DatabaseSync(cfg.articlesDb)
  assert.equal(adb2.prepare('SELECT content FROM articles WHERE id = 1').get()!.content, '<p>a</p>')
  assert.equal(adb2.prepare('SELECT featured_image FROM articles WHERE id = 2').get()!.featured_image, null)
  adb2.close()
  assert.equal(removeFromArticles(cfg, ['findes-ikke.webp']), 0)
  db.close()
  for (const k of ['PHOTOS_DB', 'UPLOAD_DIR', 'ARTICLES_DB']) delete process.env[k]
  rmSync(dir, { recursive: true, force: true })
})
