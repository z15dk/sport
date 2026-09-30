import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { openPhotoDb, type Db } from '../../src/lib/photos/db.ts'
import { parseQuery } from '../../src/lib/photos/search.ts'
import { addSquadRow, addTag, clubList, deleteSquadRow, getPhoto, reviewQueue, searchPhotos, setApproved, setMatch, updateTag } from '../../src/lib/photos/store.ts'

// Search, corrections and approval against a small temporary database

const dir = mkdtempSync(path.join(tmpdir(), 'fotos-admin-'))
let db: Db
const now = new Date().toISOString()

before(() => {
  db = openPhotoDb(path.join(dir, 'b.db'))
  db.exec(`INSERT INTO clubs (id, name, aliases, colors, updated_at) VALUES
    ('brabrand', 'Brabrand', '["Brabrand IF"]', '["blå"]', '${now}'),
    ('skive', 'Skive', '[]', '["gul","blå"]', '${now}'),
    ('fremad-amager', 'Fremad Amager', '[]', '["blå"]', '${now}')`)
  db.exec(`INSERT INTO matches (match_key, date, home_id, away_id, source, has_lineups) VALUES ('dbu:1', '2026-08-14', 'skive', 'fremad-amager', 'dbu', 1)`)
  db.exec(`INSERT INTO lineups (match_key, club_id, number, name) VALUES ('dbu:1', 'fremad-amager', 20, 'Andreas Pedersen Bredahl'), ('dbu:1', 'fremad-amager', 11, 'Christian Brøgger Hørby')`)
  db.exec(`INSERT INTO squads (club_id, number, name, valid_from, source) VALUES ('fremad-amager', 20, 'Andreas Pedersen Bredahl', '2026-07-31', 'dbu'), ('brabrand', 9, 'Elias Granlund Astola', '2026-08-07', 'dbu')`)
  const vision = JSON.stringify({ spillere: [{ nummer: 20, troejefarve: 'blå', tillid: 0.99, rygnavn: 'BREDAHL' }, { nummer: 11, troejefarve: 'blå', tillid: 0.99 }], situation: 'jubel' })
  db.prepare(`INSERT INTO photos (id, drive_id, name, path, club, club_id, opponent, opponent_id, match_date, status, review, review_reasons, review_cost, vision_json, created_at, processed_at)
    VALUES (1, 'd1', 'a.jpg', 'Fremad Amager/300926 Skive/a.jpg', 'Fremad Amager', 'fremad-amager', 'Skive', 'skive', '2026-09-30', 'tagget', 1, '["ukendt navn"]', 2, ?, ?, ?)`).run(vision, now, now)
  db.exec(`INSERT INTO tags (photo_id, number, jersey_color, side, confidence, back_name, note, source, created_at) VALUES
    (1, 20, 'blå', 'egen', 0.99, 'BREDAHL', 'står ikke på kampens holdkort', 'ai', '${now}'),
    (1, 4, 'gul', 'modstander', 0.9, NULL, NULL, 'ai', '${now}')`)
  db.prepare(`INSERT INTO photos (id, drive_id, name, path, club, club_id, opponent, opponent_id, match_date, status, situation, created_at, processed_at)
    VALUES (2, 'd2', 'b.jpg', 'Brabrand/010826 Skive/b.jpg', 'Brabrand', 'brabrand', 'Skive', 'skive', '2026-08-01', 'godkendt', 'duel', ?, ?)`).run(now, now)
  db.exec(`INSERT INTO tags (photo_id, number, side, player_name, name_source, source, created_at) VALUES (2, 9, 'egen', 'Elias Granlund Astola', 'trup', 'ai', '${now}'), (2, 20, 'modstander', NULL, NULL, 'ai', '${now}')`)
})

after(() => {
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

test('søgeord: klubnavne (også løse) og numre', () => {
  const clubs = clubList(db)
  assert.deepEqual(parseQuery('Brabrand 9', clubs), { clubIds: ['brabrand'], numbers: [9], words: [] })
  assert.deepEqual(parseQuery('Brabrand IF #9', clubs), { clubIds: ['brabrand'], numbers: [9], words: [] })
  assert.deepEqual(parseQuery('Fremad Amager jubel', clubs), { clubIds: ['fremad-amager'], numbers: [], words: ['jubel'] })
  assert.deepEqual(parseQuery('Astola', clubs), { clubIds: [], numbers: [], words: ['Astola'] })
  assert.deepEqual(parseQuery('Fremad 20', clubs), { clubIds: ['fremad-amager'], numbers: [20], words: [] })
  // Et kort ord er ikke en klub ("fre" kunne være mange ting)
  assert.deepEqual(parseQuery('fre', clubs), { clubIds: [], numbers: [], words: ['fre'] })
})

test('nummersøgning viser kun egne spillere', () => {
  assert.deepEqual(searchPhotos(db, 'Brabrand 9').map((p) => p.id), [2])
  // #20 findes på billede 2 men som modstander
  assert.deepEqual(searchPhotos(db, 'Brabrand 20').map((p) => p.id), [])
  assert.deepEqual(searchPhotos(db, '20').map((p) => p.id), [1])
})

test('søgning på navn, rygnavn, situation og kamp', () => {
  assert.deepEqual(searchPhotos(db, 'astola').map((p) => p.id), [2])
  assert.deepEqual(searchPhotos(db, 'bredahl').map((p) => p.id), [1])
  assert.deepEqual(searchPhotos(db, 'duel').map((p) => p.id), [2])
  // En klub alene: egne billeder og kampe hvor den var modstander
  assert.deepEqual(searchPhotos(db, 'Skive').map((p) => p.id).sort(), [1, 2])
  assert.deepEqual(searchPhotos(db, '', 'godkendt').map((p) => p.id), [2])
  assert.deepEqual(searchPhotos(db, '', 'gennemgang').map((p) => p.id), [1])
})

test('gennemgang foreslår spilleren ud fra rygnavnet', () => {
  const [item] = reviewQueue(db)
  assert.equal(item.photo.id, 1)
  assert.equal(item.suggestions.length, 1)
  assert.equal(item.suggestions[0].name, 'Andreas Pedersen Bredahl')
  assert.equal(item.suggestions[0].otherNumber, false)
})

test('ret kampen: navnene findes igen fra holdkortet uden nyt AI-kald', () => {
  assert.deepEqual(setMatch(db, 1, { date: '2026-08-14' }, 0.8), {})
  const { tags, photo } = getPhoto(db, 1)!
  assert.deepEqual(tags.filter((t) => t.side === 'egen').map((t) => [t.number, t.playerName]).sort(), [[11, 'Christian Brøgger Hørby'], [20, 'Andreas Pedersen Bredahl']])
  assert.equal(photo.review, false)
  assert.equal(setMatch(db, 1, { date: '14-08-2026' }, 0.8).error, 'Datoen skal være ÅÅÅÅ-MM-DD')
})

test('rettelser: tomt navn slås op, forkert nummer afvises', () => {
  const tag = getPhoto(db, 1)!.tags.find((t) => t.number === 11)!
  assert.deepEqual(updateTag(db, tag.id, { name: 'Selvvalgt Navn' }), { name: 'Selvvalgt Navn', note: null })
  assert.equal(updateTag(db, tag.id, { number: 100 }).error, 'Nummeret skal være 0–99')
  const added = addTag(db, 1, { number: 20, side: 'egen' })
  assert.equal(added.name, 'Andreas Pedersen Bredahl')
  const unknown = addTag(db, 1, { number: 55, side: 'egen' })
  assert.equal(unknown.name, null)
  assert.match(unknown.note!, /#55/)
})

test('godkendelse og trup-rettelser', () => {
  assert.deepEqual(setApproved(db, 1, true), {})
  assert.equal(getPhoto(db, 1)!.photo.status, 'godkendt')
  assert.deepEqual(setApproved(db, 1, false), {})
  assert.equal(getPhoto(db, 1)!.photo.status, 'tagget')
  assert.deepEqual(addSquadRow(db, 'brabrand', { number: 9, name: 'Ny Nier' }), {})
  const dbuRow = db.prepare(`SELECT id FROM squads WHERE source = 'dbu' LIMIT 1`).get()!
  assert.match(deleteSquadRow(db, Number(dbuRow.id)).error!, /DBU/)
})
