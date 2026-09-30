import { isAdmin } from '../../../../../../lib/admin'
import { FORMATS, type SomeFormat } from '../../../../../../lib/photos/crop'
import { someImage } from '../../../../../../lib/photos/server'

/** A JPEG for social media, cut around a player: ?format=post|story|kvadrat&tag=<tag id> */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return new Response('Ikke logget ind', { status: 401 })
  const id = Number((await params).id)
  const q = new URL(request.url).searchParams
  const format = (q.get('format') ?? 'post') as SomeFormat
  if (!Number.isInteger(id) || !(format in FORMATS)) return new Response('Ikke fundet', { status: 404 })
  const tag = q.get('tag') ? Number(q.get('tag')) : undefined
  try {
    const out = await someImage(id, format, tag)
    if (!out) return new Response('Billedet findes ikke', { status: 404 })
    return new Response(new Uint8Array(out.jpeg), {
      headers: { 'content-type': 'image/jpeg', 'content-disposition': `attachment; filename="${out.name}"`, 'cache-control': 'private, no-store' },
    })
  } catch (e) {
    return new Response(`Billedet kunne ikke laves: ${(e as Error).message}`, { status: 502 })
  }
}
