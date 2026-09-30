import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'
import { cropToJpeg } from '../../src/lib/photos/some.ts'

test('SoMe fra en drejet original: rigtig størrelse og udsnit om spilleren', async () => {
  // 4000×3000 liggende på disken, men EXIF siger "drej 90°": opret står den 3000×4000.
  // Venstre halvdel rød, højre halvdel blå (på disken) – opret: øverst rød, nederst blå
  const left = await sharp({ create: { width: 2000, height: 3000, channels: 3, background: '#f00' } }).png().toBuffer()
  const original = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: '#00f' } })
    .composite([{ input: left, left: 0, top: 0 }])
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer()
  for (const [format, w, h] of [['post', 1080, 1350], ['story', 1080, 1920], ['kvadrat', 1080, 1080], ['bred', 1920, 1080]] as const) {
    const meta = await sharp(await cropToJpeg(original, format)).metadata()
    assert.deepEqual([meta.format, meta.width, meta.height], ['jpeg', w, h], format)
  }
  // 16:9 af det oprette billede (3000×1688) om en spiller øverst → rødt, nederst → blåt
  const top = await sharp(await cropToJpeg(original, 'bred', [0, 300, 300, 700])).stats()
  assert.ok(top.channels[0].mean > 200 && top.channels[2].mean < 60)
  const bottom = await sharp(await cropToJpeg(original, 'bred', [800, 300, 1000, 700])).stats()
  assert.ok(bottom.channels[2].mean > 200 && bottom.channels[0].mean < 60)
})
