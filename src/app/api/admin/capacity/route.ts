import { adminDenied } from '../../../../lib/admin'
import { sendCapacityTestMail } from '../../../../lib/capacity'
import { mailErrorText, mailReady } from '../../../../lib/mail'

/** "Send prøvemail" on /admin/data: mails the server's capacity report now and returns what the SMTP server answered, so the owner can see where a mail that does not arrive stopped */
export async function POST(request: Request) {
  const denied = await adminDenied(request)
  if (denied) return Response.json({ error: denied }, { status: 401 })
  if (!mailReady()) return Response.json({ error: 'Mail er ikke sat op – udfyld SMTP under Sociale medier → Indstillinger' }, { status: 400 })
  try {
    const result = await sendCapacityTestMail()
    return Response.json({ ok: true, result })
  } catch (err) {
    console.error('Prøvemail (kapacitet) fejlede:', err)
    return Response.json({ error: mailErrorText(err) }, { status: 500 })
  }
}
