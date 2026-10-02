import { adminDenied } from '../../../../lib/admin'
import { setLeagueFollow, type FollowChoice } from '../../../../lib/leagueFollow'

/** Switch an API-Sports league on or off: JSON { api, id, choice: 'on' | 'off' | null } (null: the built-in list decides) */
export async function POST(request: Request) {
  const denied = await adminDenied(request)
  if (denied) return Response.json({ error: denied }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as { api?: unknown; id?: unknown; choice?: unknown }
  const choice = body.choice === 'on' || body.choice === 'off' ? (body.choice as FollowChoice) : undefined
  const { error } = setLeagueFollow(String(body.api ?? 'football'), String(body.id ?? ''), choice)
  if (error) return Response.json({ error }, { status: 400 })
  return Response.json({ ok: true })
}
