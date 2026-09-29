import { isAdmin, sameOrigin } from '../../../../lib/admin'
import { setClubAlias } from '../../../../lib/clubAliases'
import { forgetResolvedNames } from '../../../../lib/history'
import { refreshRealData } from '../../../../lib/realdata'

/** An unknown team's name given to one of our clubs (or taken away): JSON { club, name, remove? } */
export async function POST(request: Request) {
  if (!(await isAdmin()) || !sameOrigin(request)) return Response.json({ error: 'Ikke logget ind' }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as { club?: unknown; name?: unknown; remove?: unknown }
  const club = String(body.club ?? '')
  const { error } = setClubAlias(club, String(body.name ?? ''), body.remove === true)
  if (error) return Response.json({ error }, { status: 400 })
  forgetResolvedNames()
  refreshRealData()
  return Response.json({ ok: true })
}
