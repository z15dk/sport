import { adminDenied } from '../../../../lib/admin'
import { requestScoutRun } from '../../../../lib/articleQuality'
import { saveEditorRules } from '../../../../lib/editorRules'

// /admin/redaktoer: the standing rules for the Claude writer, and "Find nyheder nu" (an extra round of the news
// scout) – plain form posts, then back to the page

export async function POST(request: Request) {
  const denied = await adminDenied(request)
  if (denied) return new Response(denied, { status: 401 })
  const form = await request.formData()
  if (form.get('spejder')) {
    const ok = requestScoutRun()
    return new Response(null, { status: 303, headers: { Location: `/admin/redaktoer?spejder=${ok ? 1 : 'fejl'}` } })
  }
  saveEditorRules(String(form.get('regler') ?? ''))
  return new Response(null, { status: 303, headers: { Location: '/admin/redaktoer?gemt=1' } })
}
