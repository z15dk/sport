import { isAdmin, sameOrigin } from '../../../../lib/admin'
import { setChannelLink } from '../../../../lib/channelLinks'
import { refreshRealData } from '../../../../lib/realdata'

/** Set the link on a channel's logo: JSON { id, url }; an empty url removes it */
export async function POST(request: Request) {
  if (!(await isAdmin()) || !sameOrigin(request)) return Response.json({ error: 'Ikke logget ind' }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as { id?: unknown; url?: unknown }
  const { error } = setChannelLink(String(body.id ?? ''), String(body.url ?? ''))
  if (error) return Response.json({ error }, { status: 400 })
  refreshRealData()
  return Response.json({ ok: true })
}
