import { proxiedPicture } from '../../../lib/imageProxy'

/** A logo, player photo or flag from our own domain: "<id>-<width>.webp" (or "<id>" for 256 px) */
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const m = /^([a-f0-9]{20})(?:-(\d{2,3})\.webp)?$/.exec((await params).file)
  if (!m) return new Response('Ikke fundet', { status: 404 })
  const bytes = await proxiedPicture(m[1], m[2] ? Number(m[2]) : 256)
  if (!bytes) return new Response('Ikke fundet', { status: 404, headers: { 'cache-control': 'public, max-age=300' } })
  return new Response(new Uint8Array(bytes), { headers: { 'content-type': 'image/webp', 'cache-control': 'public, max-age=31536000, immutable' } })
}
