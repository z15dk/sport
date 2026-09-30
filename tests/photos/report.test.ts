import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { openPhotoDb } from '../../src/lib/photos/db.ts'
import { buildReport, reportText, reportWorthSending } from '../../src/lib/photos/report.ts'

test('morgenrapport: nye billeder pr. kamp, fejl og lån der udløber', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'rapport-'))
  const db = openPhotoDb(path.join(dir, 'b.db'))
  const now = new Date().toISOString()
  const soon = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10)
  db.prepare(`INSERT INTO photos (drive_id, name, path, club, opponent, match_date, status, review, processed_at, created_at) VALUES ('a', 'a', 'B/x/a', 'Brabrand', 'Skive', '2026-08-01', 'tagget', 1, ?, ?), ('b', 'b', 'B/x/b', 'Brabrand', 'Skive', '2026-08-01', 'tagget', 0, ?, ?)`).run(now, now, now, now)
  db.prepare(`INSERT INTO photos (drive_id, name, path, status, error, created_at) VALUES ('c', 'c', 'løst.jpg', 'fejl', 'Kampmappen mangler', ?)`).run(now)
  db.prepare(`INSERT INTO photos (drive_id, name, path, status, credit, license_until, created_at) VALUES ('d', 'd', 'L/y/d', 'tagget', 'Foto: Jens', ?, ?)`).run(soon, now)
  const r = buildReport(db, new Date(Date.now() - 3600_000).toISOString())
  assert.deepEqual(r.newByMatch, [{ match: 'Brabrand – Skive 2026-08-01', count: 2, review: 1 }])
  assert.equal(r.reviewQueue, 1)
  assert.equal(r.errors.length, 1)
  assert.equal(r.expiringSoon[0].credit, 'Foto: Jens')
  const m = reportText(r, 'https://matchly.dk/admin/billeder')
  assert.match(m.subject, /2 nye, 1 til gennemgang/)
  assert.match(m.text, /Kampmappen mangler/)
  assert.equal(reportWorthSending(r), true)
  const empty = buildReport(db, new Date(Date.now() + 3600_000).toISOString())
  assert.equal(empty.newTotal, 0)
  db.close()
  rmSync(dir, { recursive: true, force: true })
})
