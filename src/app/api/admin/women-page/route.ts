import { adminDenied } from '../../../../lib/admin'
import { saveUpload } from '../../../../lib/uploads'
import { saveWomenPage } from '../../../../lib/womenPage'

// /admin/kvindesport: a new picture for the top (multipart "file"), or the texts and choices (JSON)
export async function POST(request: Request) {
  const denied = await adminDenied(request)
  if (denied) return Response.json({ error: denied }, { status: 401 })
  if ((request.headers.get('content-type') ?? '').startsWith('multipart/')) {
    const form = await request.formData().catch(() => undefined)
    const file = form?.get('file')
    if (!file || typeof file === 'string') return Response.json({ error: 'Vælg et billede' }, { status: 400 })
    // Wide enough for the top on a big screen
    const result = await saveUpload(Buffer.from(await file.arrayBuffer()), 2400)
    if (result.error) return Response.json({ error: result.error }, { status: 400 })
    return Response.json({ ok: true, page: saveWomenPage({ image: result.url }) })
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  return Response.json({ ok: true, page: saveWomenPage(body) })
}
