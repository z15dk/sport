import { adminDenied } from '../../../../lib/admin'
import { applyFeedAction, type FeedAction } from '../../../../lib/news'

/** Adds, switches on/off or removes a news feed (JSON, see FeedAction) */
export async function POST(request: Request) {
  const denied = await adminDenied(request)
  if (denied) return Response.json({ error: denied }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as FeedAction
  const { error } = applyFeedAction(body)
  if (error) return Response.json({ error }, { status: 400 })
  return Response.json({ ok: true })
}
