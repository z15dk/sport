import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clubKey, parsePhotoPath, resolveClub } from '../../src/lib/photos/paths.ts'

test('klub, dato og modstander fra stien', () => {
  assert.deepEqual(parsePhotoPath(['Brabrand', '2026-08-01_Skive', 'IMG_1.jpg']), { club: 'Brabrand', date: '2026-08-01', opponent: 'Skive' })
  assert.deepEqual(parsePhotoPath(['Brabrand', '2026-08-01_FC_Roskilde', 'a.jpg']), { club: 'Brabrand', date: '2026-08-01', opponent: 'FC Roskilde' })
})

test('forkerte stier giver en forklaring, ikke et gæt', () => {
  assert.ok('error' in parsePhotoPath(['IMG_1.jpg']))
  assert.ok('error' in parsePhotoPath(['Brabrand', 'Skive', 'a.jpg']))
  assert.ok('error' in parsePhotoPath(['Brabrand', '2026-02-30_Skive', 'a.jpg']))
  assert.ok('error' in parsePhotoPath(['Brabrand', '2026-08-01_Skive', 'ekstra', 'a.jpg']))
})

test('klubnavne sammenlignes løst', () => {
  assert.equal(clubKey('Brabrand IF'), clubKey('Brabrand'))
  assert.equal(clubKey('VSK Aarhus'), clubKey('VSK Århus'))
  const clubs = [
    { id: 'brabrand', name: 'Brabrand', aliases: [] },
    { id: 'b-93', name: 'B.93', aliases: [] },
    { id: 'fc-roskilde', name: 'FC Roskilde', aliases: ['Roskilde'] },
  ]
  assert.equal(resolveClub('Brabrand IF', clubs)?.id, 'brabrand')
  assert.equal(resolveClub('B93', clubs)?.id, undefined)
  assert.equal(resolveClub('B 93', clubs)?.id, 'b-93')
  assert.equal(resolveClub('Roskilde', clubs)?.id, 'fc-roskilde')
  assert.equal(resolveClub('Ukendt IF', clubs), undefined)
})
