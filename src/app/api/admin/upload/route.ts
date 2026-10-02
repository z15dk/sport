import { adminDenied } from '../../../../lib/admin'
import { saveUpload } from '../../../../lib/uploads'
import { withPhotoDb } from '../../../../lib/photos/server'
import { registerArticleUpload } from '../../../../lib/photos/store'

/** Uploads a picture for an article (multipart field "file"); it also goes into the photo archive, whose metadata the editor asks for */
export async function POST(request: Request) {
  const denied = await adminDenied(request)
  if (denied) return Response.json({ error: denied }, { status: 401 })
  const form = await request.formData().catch(() => undefined)
  const file = form?.get('file')
  if (!file || typeof file === 'string') return Response.json({ error: 'Vælg et billede' }, { status: 400 })
  const result = await saveUpload(Buffer.from(await file.arrayBuffer()))
  if (result.error) return Response.json({ error: result.error }, { status: 400 })
  let photoId: number | undefined
  try {
    photoId = withPhotoDb((db) => registerArticleUpload(db, result.url!.replace('/uploads/', '')))
  } catch {
    // The article still gets its picture; it is just not in the archive
  }
  return Response.json({ ...result, photoId })
}
