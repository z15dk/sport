import assert from 'node:assert/strict'
import { test } from 'node:test'
import { tagPhoto, type TaggingContext } from '../../src/lib/photos/tagging.ts'
import type { VisionResult } from '../../src/lib/photos/vision.ts'

const ctx: TaggingContext = {
  clubKnown: true,
  ownColors: ['rød', 'hvid'],
  opponentColors: ['grøn'],
  matchDate: '2026-08-15',
  lineup: [{ number: 9, name: 'Ni Nisen' }, { number: 10, name: 'Ti Tisen' }],
  squad: [],
  minConfidence: 0.8,
}
const vision = (players: VisionResult['players']): VisionResult => ({ players, situation: 'jubel', model: 'test' })

test('egen spiller med sikkert nummer får navn fra holdkortet', () => {
  const r = tagPhoto(vision([{ number: 9, jerseyColor: 'rød', confidence: 0.95, box: [100, 100, 900, 400] }]), ctx)
  assert.equal(r.tags[0].side, 'egen')
  assert.equal(r.tags[0].playerName, 'Ni Nisen')
  assert.equal(r.tags[0].nameSource, 'kamp')
  assert.equal(r.review, false)
  assert.equal(r.situation, 'jubel')
})

test('modstander får intet navn og kræver ingen gennemgang', () => {
  const r = tagPhoto(vision([{ number: 4, jerseyColor: 'grøn', confidence: 0.9 }]), ctx)
  assert.equal(r.tags[0].side, 'modstander')
  assert.equal(r.tags[0].playerName, undefined)
  assert.equal(r.review, false)
})

test('lav tillid: nummer uden navn, til gennemgang', () => {
  const r = tagPhoto(vision([{ number: 9, jerseyColor: 'rød', confidence: 0.6 }]), ctx)
  assert.equal(r.tags[0].playerName, undefined)
  assert.deepEqual(r.reasons, ['lav tillid'])
})

test('usikkert hold: intet navn, til gennemgang', () => {
  const r = tagPhoto(vision([{ number: 9, jerseyColor: 'grå', confidence: 0.99 }]), { ...ctx, opponentColors: ['hvid'] })
  assert.equal(r.tags[0].side, 'ukendt')
  assert.equal(r.tags[0].playerName, undefined)
  assert.ok(r.reasons.includes('hold usikkert'))
})

test('nummer som ikke er på holdkortet: ukendt navn', () => {
  const r = tagPhoto(vision([{ number: 77, jerseyColor: 'rød', confidence: 0.99 }]), ctx)
  assert.equal(r.tags[0].playerName, undefined)
  assert.ok(r.reasons.includes('ukendt navn'))
})

test('samme egne nummer to gange: ingen af dem får navn', () => {
  const r = tagPhoto(vision([{ number: 9, jerseyColor: 'rød', confidence: 0.99 }, { number: 9, jerseyColor: 'rød', confidence: 0.9 }]), ctx)
  assert.ok(r.tags.every((t) => !t.playerName))
  assert.ok(r.reasons.includes('samme nummer to gange'))
})

test('ingen numre og ukendt klub går i gennemgang, dyrest sidst', () => {
  const none = tagPhoto(vision([]), ctx)
  assert.deepEqual(none.reasons, ['ingen numre'])
  const unknown = tagPhoto(vision([{ number: 9, jerseyColor: 'rød', confidence: 0.99 }]), { ...ctx, clubKnown: false })
  assert.equal(unknown.tags[0].playerName, undefined)
  assert.ok(unknown.cost > none.cost)
  const quick = tagPhoto(vision([{ number: 9, jerseyColor: 'rød', confidence: 0.6 }]), ctx)
  assert.ok(quick.cost < none.cost)
})

test('rygnavnet bekræfter eller afviser navnet', () => {
  const ok = tagPhoto(vision([{ number: 9, jerseyColor: 'rød', confidence: 0.95, backName: 'NISEN' }]), ctx)
  assert.equal(ok.tags[0].playerName, 'Ni Nisen')
  assert.equal(ok.review, false)
  const wrong = tagPhoto(vision([{ number: 9, jerseyColor: 'rød', confidence: 0.95, backName: 'HANSEN' }]), ctx)
  assert.equal(wrong.tags[0].playerName, undefined)
  assert.ok(wrong.reasons.includes('navn passer ikke'))
  assert.match(wrong.tags[0].note!, /HANSEN/)
})
