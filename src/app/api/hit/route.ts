import { cookies } from 'next/headers'
import { COOKIE } from '../../../lib/admin'
import { recordView } from '../../../lib/visits'

// A page view from the page itself (src/components/VisitBeacon.tsx), for our own visitor statistics (src/lib/visits.ts)
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { p?: unknown; r?: unknown }
  const h = request.headers
  // Behind the web server (Caddy/nginx) the visitor's address is the first in X-Forwarded-For
  const ip = h.get('x-forwarded-for')?.split(',')[0].trim() || h.get('x-real-ip') || ''
  recordView({ path: body.p, ref: body.r, ip, ua: h.get('user-agent') ?? '', host: h.get('host') ?? undefined, admin: !!(await cookies()).get(COOKIE) })
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
}
