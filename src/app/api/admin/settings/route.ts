import { adminDenied } from '../../../../lib/admin'
import { setSetting } from '../../../../lib/settings'
import { refreshRealData } from '../../../../lib/realdata'

/** Change a site setting: JSON { key, value } */
export async function POST(request: Request) {
  const denied = await adminDenied(request)
  if (denied) return Response.json({ error: denied }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as { key?: unknown; value?: unknown }
  const { error } = setSetting(String(body.key ?? ''), body.value)
  if (error) return Response.json({ error }, { status: 400 })
  refreshRealData()
  return Response.json({ ok: true })
}
