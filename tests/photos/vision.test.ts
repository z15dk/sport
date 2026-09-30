import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PhotoError, parseVisionJson } from '../../src/lib/photos/vision.ts'

test('gyldigt svar læses, også i ```json-blok', () => {
  const r = parseVisionJson('```json\n{"spillere":[{"nummer":9,"troejefarve":"Rød","tillid":0.93,"boks":[10,20,900,400]}],"situation":"Jubel"}\n```', 'm')
  assert.deepEqual(r.players, [{ number: 9, jerseyColor: 'rød', confidence: 0.93, box: [10, 20, 900, 400] }])
  assert.equal(r.situation, 'jubel')
})

test('ugyldige felter droppes i stedet for at blive gættet', () => {
  const r = parseVisionJson('{"spillere":[{"nummer":"9"},{"nummer":123},{"nummer":7.5},{"nummer":null},{"nummer":4,"tillid":3,"boks":[900,0,100,10]}]}', 'm')
  assert.deepEqual(r.players.map((p) => p.number), [9, 4])
  assert.equal(r.players[1].confidence, 1)
  assert.equal(r.players[1].box, undefined)
})

test('ikke-JSON giver en fejl på billedet', () => {
  assert.throws(() => parseVisionJson('Jeg kan se nummer 9', 'm'), PhotoError)
})
