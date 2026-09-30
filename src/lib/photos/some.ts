import sharp from 'sharp'
import { FORMATS, cropRect, type SomeFormat } from './crop.ts'

// Cuts a SoMe JPEG out of a picture: the original from Drive when it is still
// there (sharpest), otherwise the 1600 px web version. The box is on 0–1000 of the
// upright picture, so the original is turned by its EXIF orientation first.

export async function cropToJpeg(picture: Buffer, format: SomeFormat, box?: [number, number, number, number]): Promise<Buffer> {
  // Upright pixels once, then cut and scale (extract and rotate in one pipeline would cut before turning)
  const { data, info } = await sharp(picture, { failOn: 'truncated' }).rotate().removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const target = FORMATS[format]
  const r = cropRect(info.width, info.height, target.width, target.height, box)
  return sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .extract(r)
    .resize(target.width, target.height, { kernel: 'lanczos3' })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer()
}
