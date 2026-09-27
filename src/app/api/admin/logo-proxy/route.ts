import { isAdmin } from '../../../../lib/admin'

// Logos for the social media cards' download (/admin/sociale): the browser may
// only put images from our own address into a picture, so the logos from
// TheSportsDB and API-Sports are passed through here. Admins only, only those
// hosts, only images, at most 1 MB.

const MAX_BYTES = 1_000_000

function allowed(raw: string | null) {
  if (!raw) return undefined
  try {
    const url = new URL(raw)
    const host = url.hostname
    const ok = url.protocol === 'https:' && (host === 'thesportsdb.com' || host.endsWith('.thesportsdb.com') || host.endsWith('.api-sports.io'))
    return ok ? url : undefined
  } catch {
    return undefined
  }
}

export async function GET(request: Request) {
  if (!(await isAdmin())) return new Response('Ikke logget ind', { status: 401 })
  const url = allowed(new URL(request.url).searchParams.get('url'))
  if (!url) return new Response('Adressen er ikke tilladt', { status: 400 })
  try {
    const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(8000) })
    const type = res.headers.get('content-type') ?? ''
    if (!res.ok || !type.startsWith('image/')) return new Response('Intet billede', { status: 502 })
    const body = await res.arrayBuffer()
    if (body.byteLength > MAX_BYTES) return new Response('Billedet er for stort', { status: 502 })
    return new Response(body, { headers: { 'content-type': type, 'cache-control': 'private, max-age=86400' } })
  } catch {
    return new Response('Kunne ikke hente billedet', { status: 502 })
  }
}
