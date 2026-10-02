import { adminDenied } from '../../../../lib/admin'
import { saveTracking } from '../../../../lib/tracking'

/** Google Analytics and Meta Pixel ids: JSON { ga, metaPixel } (empty = off) */
export async function POST(request: Request) {
  const denied = await adminDenied(request)
  if (denied) return Response.json({ error: denied }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as { ga?: unknown; metaPixel?: unknown; metaVerify?: unknown; owner?: unknown }
  const { error } = saveTracking(body)
  if (error) return Response.json({ error }, { status: 400 })
  return Response.json({ ok: true })
}
