import { isAdmin, sameOrigin } from '../../../../lib/admin'
import { sendCapacityTestMail } from '../../../../lib/capacity'
import { mailReady } from '../../../../lib/mail'

/** "Send prøvemail" on /admin/data: mails the server's capacity report now, so the owner can see that the warning mail arrives */
export async function POST(request: Request) {
  if (!(await isAdmin()) || !sameOrigin(request)) return Response.json({ error: 'Ikke logget ind' }, { status: 401 })
  if (!mailReady()) return Response.json({ error: 'Mail er ikke sat op – udfyld SMTP under Sociale medier → Indstillinger' }, { status: 400 })
  try {
    await sendCapacityTestMail()
    return Response.json({ ok: true })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Mailen kunne ikke sendes' }, { status: 500 })
  }
}
