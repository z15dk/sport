import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'
import { groupBursts, hamming, measure } from '../../src/lib/photos/quality.ts'

const raw = async (img: ReturnType<typeof sharp>) => {
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height, channels: info.channels }
}

test('skarphed: et sløret billede får lavere tal end det skarpe', async () => {
  // Skakbræt = mange kanter
  const tile = Buffer.alloc(64 * 64 * 3)
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) tile.fill(((x >> 3) + (y >> 3)) % 2 ? 255 : 0, (y * 64 + x) * 3, (y * 64 + x) * 3 + 3)
  const sharpImg = await sharp(tile, { raw: { width: 64, height: 64, channels: 3 } }).resize(1600, 1600, { kernel: 'nearest' }).png().toBuffer()
  const a = await measure(await raw(sharp(sharpImg)))
  const b = await measure(await raw(sharp(sharpImg).blur(12)))
  assert.ok(a.sharpness > b.sharpness * 2, `${a.sharpness} > ${b.sharpness}`)
  // Samme motiv sløret ligner stadig (få forskellige bits)
  assert.ok(hamming(a.dhash, b.dhash) <= 12)
})

test('serieskud: ens billeder tæt på hinanden samles, skarpeste først', () => {
  const g = groupBursts([
    { id: 1, matchKey: 'k', takenAt: '2026-08-01T14:00:00', dhash: '0000000000000000', sharpness: 5 },
    { id: 2, matchKey: 'k', takenAt: '2026-08-01T14:00:01', dhash: '0000000000000003', sharpness: 9 },
    { id: 3, matchKey: 'k', takenAt: '2026-08-01T14:00:02', dhash: '000000000000000f', sharpness: 7 },
    // Andet motiv
    { id: 4, matchKey: 'k', takenAt: '2026-08-01T14:00:03', dhash: 'ffffffffffffffff', sharpness: 8 },
    // Samme motiv, men et minut senere
    { id: 5, matchKey: 'k', takenAt: '2026-08-01T14:01:05', dhash: 'ffffffffffffffff', sharpness: 8 },
    // Anden kamp
    { id: 6, matchKey: 'x', takenAt: '2026-08-01T14:00:01', dhash: '0000000000000000', sharpness: 1 },
  ])
  assert.deepEqual(g, [[2, 3, 1]])
})

test('serieskud uden kameratid: rækkefølgen og udseendet afgør', () => {
  const g = groupBursts([
    { id: 10, matchKey: 'k', dhash: 'aaaaaaaaaaaaaaaa', sharpness: 1 },
    { id: 11, matchKey: 'k', dhash: 'aaaaaaaaaaaaaaab', sharpness: 2 },
    { id: 12, matchKey: 'k', dhash: '5555555555555555', sharpness: 3 },
  ])
  assert.deepEqual(g, [[11, 10]])
})
