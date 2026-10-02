import { adminDenied } from '../../../../lib/admin'
import { applyChannelAction, type ChannelAction } from '../../../../lib/channels'
import { refreshRealData } from '../../../../lib/realdata'

/** Changes to channels, rules and per-match exceptions (JSON, see ChannelAction) */
export async function POST(request: Request) {
  const denied = await adminDenied(request)
  if (denied) return Response.json({ error: denied }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as ChannelAction
  const { error } = applyChannelAction(body)
  if (error) return Response.json({ error }, { status: 400 })
  refreshRealData()
  return Response.json({ ok: true })
}
