import { isAdmin, sameOrigin } from '../../../../lib/admin'
import { setSetting } from '../../../../lib/settings'
import { refreshRealData } from '../../../../lib/realdata'

/** Change a site setting: JSON { key, value } */
export async function POST(request: Request) {
  if (!(await isAdmin()) || !sameOrigin(request)) return Response.json({ error: 'Ikke logget ind' }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as { key?: unknown; value?: unknown }
  const { error } = setSetting(String(body.key ?? ''), body.value)
  if (error) return Response.json({ error }, { status: 400 })
  refreshRealData()
  return Response.json({ ok: true })
}
