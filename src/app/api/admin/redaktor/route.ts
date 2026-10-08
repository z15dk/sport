import { adminDenied } from '../../../../lib/admin'
import { saveEditorRules } from '../../../../lib/editorRules'

// /admin/redaktoer: the standing rules for the Claude writer (a plain form post, then back to the page)

export async function POST(request: Request) {
  const denied = await adminDenied(request)
  if (denied) return new Response(denied, { status: 401 })
  const form = await request.formData()
  saveEditorRules(String(form.get('regler') ?? ''))
  return new Response(null, { status: 303, headers: { Location: '/admin/redaktoer?gemt=1' } })
}
