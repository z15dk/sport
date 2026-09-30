import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FORMATS, cropRect } from '../../src/lib/photos/crop.ts'

test('4:5 fra et liggende billede: fuld højde, centreret på spilleren', () => {
  const r = cropRect(1600, 1067, 1080, 1350, [100, 500, 900, 600])
  assert.equal(r.height, 1067)
  assert.equal(r.width, Math.round(1067 * 0.8))
  // Spillerens midte (x = 550/1000 * 1600 = 880) ligger i udsnittets midte
  assert.ok(Math.abs(r.left + r.width / 2 - 880) <= 1)
})

test('udsnittet holdes inden for billedet ved kanten', () => {
  const right = cropRect(1600, 1067, 1080, 1920, [100, 950, 900, 1000])
  assert.equal(right.left + right.width, 1600)
  const left = cropRect(1600, 1067, 1080, 1920, [100, 0, 900, 40])
  assert.equal(left.left, 0)
})

test('kvadrat fra et stående billede: fuld bredde, lodret efter spilleren', () => {
  const r = cropRect(1200, 1600, 1080, 1080, [600, 400, 1000, 600])
  assert.equal(r.width, 1200)
  assert.equal(r.height, 1200)
  assert.ok(r.top > 0 && r.top + r.height <= 1600)
})

test('uden spiller: midten af billedet', () => {
  const r = cropRect(1600, 1067, FORMATS.kvadrat.width, FORMATS.kvadrat.height)
  assert.equal(r.left, Math.round((1600 - 1067) / 2))
  assert.equal(r.top, 0)
})

test('16:9 fra et liggende 3:2-billede: fuld bredde, lodret efter spilleren', () => {
  const r = cropRect(1600, 1067, FORMATS.bred.width, FORMATS.bred.height, [50, 400, 500, 500])
  assert.equal(r.width, 1600)
  assert.equal(r.height, 900)
  assert.equal(r.left, 0)
  assert.equal(r.top, 0)
})
