import { isAdmin, sameOrigin } from '../../../../lib/admin'
import { applyChannelAction, type ChannelAction } from '../../../../lib/channels'
import { refreshRealData } from '../../../../lib/realdata'

/** Changes to channels, rules and per-match exceptions (JSON, see ChannelAction) */
export async function POST(request: Request) {
  if (!(await isAdmin()) || !sameOrigin(request)) return Response.json({ error: 'Ikke logget ind' }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as ChannelAction
  const { error } = applyChannelAction(body)
  if (error) return Response.json({ error }, { status: 400 })
  refreshRealData()
  return Response.json({ ok: true })
}
