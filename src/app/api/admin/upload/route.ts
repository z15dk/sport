import { isAdmin, sameOrigin } from '../../../../lib/admin'
import { saveUpload } from '../../../../lib/uploads'

/** Uploads a picture for an article (multipart field "file") */
export async function POST(request: Request) {
  if (!(await isAdmin()) || !sameOrigin(request)) return Response.json({ error: 'Ikke logget ind' }, { status: 401 })
  const form = await request.formData().catch(() => undefined)
  const file = form?.get('file')
  if (!file || typeof file === 'string') return Response.json({ error: 'Vælg et billede' }, { status: 400 })
  const result = await saveUpload(Buffer.from(await file.arrayBuffer()))
  if (result.error) return Response.json({ error: result.error }, { status: 400 })
  return Response.json(result)
}
