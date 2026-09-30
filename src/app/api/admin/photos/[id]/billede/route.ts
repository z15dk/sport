import { isAdmin } from '../../../../../../lib/admin'
import { photoImage } from '../../../../../../lib/photos/server'

/** A photo's thumbnail (?v=thumb) or 1600 px web version (?v=web), for logged-in admins only */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return new Response('Ikke logget ind', { status: 401 })
  const id = Number((await params).id)
  const variant = new URL(request.url).searchParams.get('v') === 'web' ? 'web' : 'thumb'
  if (!Number.isInteger(id)) return new Response('Ikke fundet', { status: 404 })
  try {
    const bytes = await photoImage(id, variant)
    if (!bytes) return new Response('Ikke fundet', { status: 404 })
    return new Response(new Uint8Array(bytes), { headers: { 'content-type': 'image/webp', 'cache-control': 'private, max-age=86400' } })
  } catch (e) {
    return new Response(`Billedet kunne ikke hentes: ${(e as Error).message}`, { status: 502 })
  }
}
