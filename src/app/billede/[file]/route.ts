import sharp from 'sharp'
import { proxiedPicture } from '../../../lib/imageProxy'

/** A logo, player photo or flag from our own domain: "<id>-<width>.webp" (or "<id>" for 256 px); "<id>-<width>.png" for
 * the club mail (many mail apps show no WebP) */
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const m = /^([a-f0-9]{20})(?:-(\d{2,3})\.(webp|png))?$/.exec((await params).file)
  if (!m) return new Response('Ikke fundet', { status: 404 })
  const bytes = await proxiedPicture(m[1], m[2] ? Number(m[2]) : 256)
  if (!bytes) return new Response('Ikke fundet', { status: 404, headers: { 'cache-control': 'public, max-age=300' } })
  if (m[3] === 'png') {
    const png = await sharp(bytes).png().toBuffer()
    return new Response(new Uint8Array(png), { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=31536000, immutable' } })
  }
  return new Response(new Uint8Array(bytes), { headers: { 'content-type': 'image/webp', 'cache-control': 'public, max-age=31536000, immutable' } })
}
