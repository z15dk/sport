import { adminDenied } from '../../../../lib/admin'
import { setLeagueName } from '../../../../lib/leagueNames'
import { refreshRealData } from '../../../../lib/realdata'

/** Change a league's name: JSON { slug, name }; an empty name restores the original */
export async function POST(request: Request) {
  const denied = await adminDenied(request)
  if (denied) return Response.json({ error: denied }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as { slug?: unknown; name?: unknown }
  const { error } = setLeagueName(String(body.slug ?? ''), String(body.name ?? ''))
  if (error) return Response.json({ error }, { status: 400 })
  refreshRealData()
  return Response.json({ ok: true })
}
