import { isAdmin } from '../../../../lib/admin'
import { parseIds, publishDraft, validArticleApproval, validArticlesApproval } from '../../../../lib/articleApproval'

// The buttons on /admin/artikler/godkend/<id>: signed by the mail's link, so they work on the
// phone without logging in. A plain form post, then back to the page.

export async function POST(request: Request) {
  const form = await request.formData()
  const when = form.get('when') === 'morning' ? 'morning' : 'now'
  // Several drafts at once (/admin/artikler/godkend/alle): the list's own signature
  if (form.get('ids')) {
    const list = String(form.get('ids'))
    const ids = parseIds(list)
    const token = String(form.get('t') ?? '')
    if (!validArticlesApproval(ids, token) && !(await isAdmin())) return new Response('Linket er ikke gyldigt', { status: 403 })
    const errors = ids.map((x) => publishDraft(x, when).error).filter(Boolean)
    const back = `/admin/artikler/godkend/alle?ids=${list}&t=${encodeURIComponent(token)}&ok=${when}${errors.length ? `&fejl=${errors.length}` : ''}`
    return new Response(null, { status: 303, headers: { Location: back } })
  }
  const id = Number(form.get('id'))
  const token = String(form.get('t') ?? '')
  if (!Number.isInteger(id) || (!validArticleApproval(id, token) && !(await isAdmin()))) return new Response('Linket er ikke gyldigt', { status: 403 })
  const { error } = publishDraft(id, when)
  const back = `/admin/artikler/godkend/${id}?t=${encodeURIComponent(token)}&${error ? `fejl=${encodeURIComponent(error)}` : `ok=${when}`}`
  return new Response(null, { status: 303, headers: { Location: back } })
}
