import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { openPhotoDb } from '../../src/lib/photos/db.ts'
import { cleanTags, kindFromAi } from '../../src/lib/photos/kinds.ts'
import { filterOptions, getPhoto, searchPhotos, setInfo } from '../../src/lib/photos/store.ts'
import { tagPhoto, type TaggingContext } from '../../src/lib/photos/tagging.ts'
import { parseVisionJson } from '../../src/lib/photos/vision.ts'

test('AI-typen oversættes, og tags renses', () => {
  assert.equal(kindFromAi('grafik'), 'grafik')
  assert.equal(kindFromAi('Infografik med tekst'), 'grafik')
  assert.equal(kindFromAi('portræt'), 'portraet')
  assert.equal(kindFromAi('holdbillede'), 'portraet')
  assert.equal(kindFromAi('kampfoto'), 'kampfoto')
  assert.equal(kindFromAi('stadion'), 'andet')
  assert.equal(kindFromAi(undefined), undefined)
  assert.deepEqual(cleanTags(' Brabrand IF, brabrand if,  infografik ,'), ['Brabrand IF', 'infografik'])
})

test('AI-svaret giver type og titel', () => {
  const r = parseVisionJson('{"spillere":[],"situation":"ingen","type":"Grafik","titel":"Ugens hold, runde 9"}', 'm')
  assert.equal(r.kind, 'grafik')
  assert.equal(r.title, 'Ugens hold, runde 9')
})

const ctx: TaggingContext = { clubKnown: false, ownColors: [], squad: [], minConfidence: 0.8 }

test('grafik: ingen spiller-tags og intet til gennemgang', () => {
  const r = tagPhoto({ players: [{ number: 9, jerseyColor: 'rød', confidence: 0.99 }], kind: 'grafik', model: 'm' }, ctx)
  assert.deepEqual([r.kind, r.tags.length, r.review], ['grafik', 0, false])
})

test('portræt og andet: hverken "ingen numre" eller "ukendt klub"', () => {
  assert.equal(tagPhoto({ players: [], kind: 'portræt', model: 'm' }, ctx).review, false)
  assert.equal(tagPhoto({ players: [], kind: 'stadion', model: 'm' }, ctx).review, false)
  assert.deepEqual(tagPhoto({ players: [], kind: 'kampfoto', model: 'm' }, ctx).reasons.sort(), ['ingen numre', 'ukendt klub'])
  // En type valgt i hånden vinder over AI'en
  assert.equal(tagPhoto({ players: [], kind: 'kampfoto', model: 'm' }, { ...ctx, kind: 'grafik' }).review, false)
})

test('titel og egne tags kan søges og filtreres; en klub i tags findes under klubben', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'kinds-'))
  const db = openPhotoDb(path.join(dir, 'b.db'))
  db.exec(`INSERT INTO clubs (id, name, colors, updated_at) VALUES ('brabrand', 'Brabrand IF', '["blå"]', 'x')`)
  db.exec(`INSERT INTO photos (id, drive_id, name, path, status, created_at, processed_at, vision_json) VALUES (1, 'a', 'a', 'p', 'tagget', 'x', 'x', '{"spillere":[{"nummer":9,"troejefarve":"blå","tillid":0.9}],"type":"kampfoto"}')`)
  assert.deepEqual(setInfo(db, 1, { kind: 'grafik', title: 'Ugens hold, runde 9', tags: 'Brabrand IF, infografik' }, 0.8), {})
  const p = getPhoto(db, 1)!
  assert.deepEqual([p.photo.kind, p.photo.kindManual, p.photo.title, p.photo.userTags], ['grafik', true, 'Ugens hold, runde 9', ['Brabrand IF', 'infografik']])
  // Typen grafik har fjernet spiller-tags (beregnet igen fra det gemte svar)
  assert.equal(p.tags.length, 0)
  // Tal i søgningen er trøjenumre; titlen findes med ordene
  assert.deepEqual(searchPhotos(db, 'ugens hold').map((x) => x.id), [1])
  assert.deepEqual(searchPhotos(db, 'infografik').map((x) => x.id), [1])
  assert.deepEqual(searchPhotos(db, 'Brabrand').map((x) => x.id), [1])
  assert.deepEqual(searchPhotos(db, '', '', 50, { clubId: 'brabrand' }).map((x) => x.id), [1])
  assert.deepEqual(searchPhotos(db, '', '', 50, { kind: 'grafik', tag: 'INFOGRAFIK' }).map((x) => x.id), [1])
  assert.deepEqual(searchPhotos(db, '', '', 50, { kind: 'kampfoto' }).length, 0)
  const o = filterOptions(db)
  assert.deepEqual(o.kinds.map((k) => [k.value, k.n]), [['grafik', 1]])
  assert.ok(o.tags.some((t) => t.value === 'infografik'))
  assert.match(setInfo(db, 1, { kind: 'video' }, 0.8).error!, /Ukendt/)
  db.close()
  rmSync(dir, { recursive: true, force: true })
})
