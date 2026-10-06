import { adminDenied } from '../../../../../lib/admin'
import { sendArticleApprovalMail } from '../../../../../lib/articleApproval'
import { mailErrorText } from '../../../../../lib/mail'

/** Mails drafts ({ ids }) with a link each for reading and publishing them on the phone */
export async function POST(request: Request) {
  const denied = await adminDenied(request)
  if (denied) return Response.json({ error: denied }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as { ids?: unknown }
  const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(Number.isInteger) : []
  try {
    const r = await sendArticleApprovalMail(ids)
    return Response.json({ ok: true, to: r.to, accepted: r.accepted })
  } catch (e) {
    return Response.json({ error: mailErrorText(e) }, { status: 400 })
  }
}
