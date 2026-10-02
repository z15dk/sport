import { isAdmin, sameOrigin } from '../../../../lib/admin'
import { saveTracking } from '../../../../lib/tracking'

/** Google Analytics and Meta Pixel ids: JSON { ga, metaPixel } (empty = off) */
export async function POST(request: Request) {
  if (!(await isAdmin()) || !sameOrigin(request)) return Response.json({ error: 'Ikke logget ind' }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as { ga?: unknown; metaPixel?: unknown; metaVerify?: unknown; owner?: unknown }
  const { error } = saveTracking(body)
  if (error) return Response.json({ error }, { status: 400 })
  return Response.json({ ok: true })
}
