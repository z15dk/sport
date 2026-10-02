import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { cacheDir } from '../../../lib/tsdb'
import { readUpload } from '../../../lib/uploads'

// The picture shown when an article is shared (Facebook, LinkedIn, Messenger,
// iMessage, X): the article's uploaded WebP as a 1200×630 JPEG – several of them
// show no preview for WebP. Made once and kept on disk.

const dir = () => path.join(/*turbopackIgnore: true*/ cacheDir(), 'data', 'delingsbilleder')

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const m = /^([a-f0-9]{24})\.jpg$/.exec((await params).file)
  if (!m) return new Response('Ikke fundet', { status: 404 })
  const file = path.join(/*turbopackIgnore: true*/ dir(), `${m[1]}.jpg`)
  let jpeg = existsSync(file) ? readFileSync(file) : undefined
  if (!jpeg) {
    const src = readUpload(`${m[1]}.webp`)
    if (!src) return new Response('Ikke fundet', { status: 404 })
    jpeg = await sharp(src).resize(1200, 630, { fit: 'cover', position: 'attention' }).flatten({ background: '#0f110c' }).jpeg({ quality: 85, mozjpeg: true }).toBuffer()
    mkdirSync(dir(), { recursive: true })
    writeFileSync(file, jpeg)
  }
  return new Response(new Uint8Array(jpeg), { headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=31536000, immutable' } })
}
