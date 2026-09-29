import { isAdmin } from '../../../../lib/admin'
import { approve, skip, validApproval } from '../../../../lib/socialEngine'
import { readPosts } from '../../../../lib/socialStore'

// The buttons on an approval mail's page (/admin/sociale/godkend/<batch>):
// signed by the mail's link, so they work on the phone without logging in.
// A plain form post, then back to the page.

export async function POST(request: Request) {
  const form = await request.formData()
  const batch = String(form.get('batch') ?? '')
  const token = String(form.get('t') ?? '')
  const action = String(form.get('action') ?? '')
  const id = String(form.get('id') ?? '')
  if (!validApproval(batch, token) && !(await isAdmin())) return new Response('Linket er ikke gyldigt', { status: 403 })
  const inBatch = readPosts().batches[batch]?.ids ?? []
  const target = id ? inBatch.filter((x) => x === id) : inBatch
  if (action === 'approve') approve(target)
  else if (action === 'skip') skip(target)
  return new Response(null, { status: 303, headers: { Location: `/admin/sociale/godkend/${batch}?t=${encodeURIComponent(token)}&ok=${action}` } })
}
