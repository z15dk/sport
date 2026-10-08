import { isAdmin, adminDenied } from '../../../../lib/admin'
import { validArticleApproval } from '../../../../lib/articleApproval'
import { articleById } from '../../../../lib/articles'
import { qualityOf, saveNote } from '../../../../lib/articleQuality'

// "Besked til Claude" + "Skriv om" on an automatic draft: from the mail's approval page (signed by its link, so it
// works on the phone) or from the article editor (admin). A plain form post, then back to the page it came from.

export async function POST(request: Request) {
  const form = await request.formData()
  const id = Number(form.get('id'))
  const token = String(form.get('t') ?? '')
  const from = String(form.get('fra') ?? '') === 'editor' ? 'editor' : 'godkend'
  const signed = Number.isInteger(id) && validArticleApproval(id, token)
  if (!signed && (await adminDenied(request))) return new Response('Linket er ikke gyldigt', { status: 403 })
  const back = (q: string) => (from === 'editor' ? `/admin/artikler/${id}?${q}` : `/admin/artikler/godkend/${id}?t=${encodeURIComponent(token)}&${q}`)
  const go = (q: string) => new Response(null, { status: 303, headers: { Location: back(q) } })
  const a = articleById(id)
  const live = !!a && a.status === 'published' && !!a.publishedAt && Date.parse(a.publishedAt) <= Date.now()
  if (!a || !qualityOf(id)) return go(`fejl=${encodeURIComponent('Kun automatiske optakter og referater kan skrives om af Claude')}`)
  if (live) return go(`fejl=${encodeURIComponent('Artiklen er udgivet – Claude retter kun kladder')}`)
  const text = String(form.get('besked') ?? '').trim()
  if (!text) return go(`fejl=${encodeURIComponent('Skriv en besked til Claude først')}`)
  saveNote(id, text, signed && !(await isAdmin()) ? 'mail' : 'admin')
  return go('claude=1')
}
