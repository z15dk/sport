import { adminDenied } from '../../../../lib/admin'
import { sendOutreach, setOutreachNote } from '../../../../lib/clubOutreach'
import { mailErrorText } from '../../../../lib/mail'

// /admin/klubkontakt: send the mail to one club, or keep its answer as a note (plain form posts, back to the page)

export async function POST(request: Request) {
  const denied = await adminDenied(request)
  if (denied) return new Response(denied, { status: 401 })
  const f = await request.formData()
  const slug = String(f.get('slug') ?? '')
  const back = (q: string) => new Response(null, { status: 303, headers: { Location: `/admin/klubkontakt?${q}#${encodeURIComponent(slug)}` } })
  if (f.get('action') === 'note') {
    setOutreachNote(slug, String(f.get('note') ?? ''))
    return back(`gemt=${encodeURIComponent(slug)}`)
  }
  try {
    await sendOutreach(slug, String(f.get('to') ?? ''), String(f.get('subject') ?? ''), String(f.get('body') ?? ''), f.get('again') === '1')
    return back(`sendt=${encodeURIComponent(slug)}`)
  } catch (e) {
    return back(`fejl=${encodeURIComponent(e instanceof Error && !/smtp|ECONN|EAUTH/i.test(e.message) ? e.message : mailErrorText(e))}&klub=${encodeURIComponent(slug)}`)
  }
}
