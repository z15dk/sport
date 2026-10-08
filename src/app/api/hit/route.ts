import { clientIp, isAdmin } from '../../../lib/admin'
import { recordView } from '../../../lib/visits'

// A page view from the page itself (src/components/VisitBeacon.tsx), for our own visitor statistics (src/lib/visits.ts)
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { p?: unknown; r?: unknown }
  const h = request.headers
  // Behind the web server (Caddy/nginx) the visitor's address is the first in X-Forwarded-For
  const ip = clientIp(request)
  recordView({ path: body.p, ref: body.r, ip, ua: h.get('user-agent') ?? '', host: h.get('host') ?? undefined, admin: await isAdmin() })
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
}
