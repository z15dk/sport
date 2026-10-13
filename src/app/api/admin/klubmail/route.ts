import { adminDenied } from '../../../../lib/admin'
import { klubmailTestMail } from '../../../../lib/klubmail/server'
import { mailErrorText } from '../../../../lib/mail'

// /admin/klubmail: "Send testmail til mig" – the club's mail to the owner's own address only (a plain form post, back to the page)

export async function POST(request: Request) {
  const denied = await adminDenied(request)
  if (denied) return new Response(denied, { status: 401 })
  const f = await request.formData()
  const slug = String(f.get('klub') ?? '')
  const back = (q: string) => new Response(null, { status: 303, headers: { Location: `/admin/klubmail?klub=${encodeURIComponent(slug)}&${q}` } })
  try {
    await klubmailTestMail(slug)
    return back('sendt=1')
  } catch (e) {
    return back(`fejl=${encodeURIComponent(e instanceof Error && !/smtp|ECONN|EAUTH/i.test(e.message) ? e.message : mailErrorText(e))}`)
  }
}
