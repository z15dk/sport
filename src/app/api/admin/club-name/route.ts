import { isAdmin, sameOrigin } from '../../../../lib/admin'
import { setClubName } from '../../../../lib/clubNames'
import { refreshRealData } from '../../../../lib/realdata'

/** Change a club's name: JSON { slug, name }; an empty name restores the original */
export async function POST(request: Request) {
  if (!(await isAdmin()) || !sameOrigin(request)) return Response.json({ error: 'Ikke logget ind' }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as { slug?: unknown; name?: unknown }
  const { error } = setClubName(String(body.slug ?? ''), String(body.name ?? ''))
  if (error) return Response.json({ error }, { status: 400 })
  refreshRealData()
  return Response.json({ ok: true })
}
