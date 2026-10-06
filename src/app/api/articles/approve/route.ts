import { isAdmin } from '../../../../lib/admin'
import { publishDraft, validArticleApproval } from '../../../../lib/articleApproval'

// The buttons on /admin/artikler/godkend/<id>: signed by the mail's link, so they work on the
// phone without logging in. A plain form post, then back to the page.

export async function POST(request: Request) {
  const form = await request.formData()
  const id = Number(form.get('id'))
  const token = String(form.get('t') ?? '')
  const when = form.get('when') === 'morning' ? 'morning' : 'now'
  if (!Number.isInteger(id) || (!validArticleApproval(id, token) && !(await isAdmin()))) return new Response('Linket er ikke gyldigt', { status: 403 })
  const { error } = publishDraft(id, when)
  const back = `/admin/artikler/godkend/${id}?t=${encodeURIComponent(token)}&${error ? `fejl=${encodeURIComponent(error)}` : `ok=${when}`}`
  return new Response(null, { status: 303, headers: { Location: back } })
}
