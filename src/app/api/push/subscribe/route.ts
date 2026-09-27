import { sameOrigin } from '../../../../lib/admin'
import { removePushSub, savePushSub, sendWelcome } from '../../../../lib/push'

/** Turns goal alerts on (or updates the teams): { subscription, teams, welcome? } */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: 'Ugyldig forespørgsel' }, { status: 403 })
  const body = (await request.json().catch(() => ({}))) as { subscription?: { endpoint?: string }; welcome?: boolean }
  const { error } = savePushSub(body)
  if (error) return Response.json({ error }, { status: 400 })
  if (body.welcome && body.subscription?.endpoint) void sendWelcome(body.subscription.endpoint)
  return Response.json({ ok: true })
}

/** Turns goal alerts off: { endpoint } */
export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: 'Ugyldig forespørgsel' }, { status: 403 })
  const body = (await request.json().catch(() => ({}))) as { endpoint?: string }
  removePushSub(body.endpoint)
  return Response.json({ ok: true })
}
