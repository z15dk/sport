import { adminDenied } from '../../../../lib/admin'
import { removeLogo, saveLogo } from '../../../../lib/customLogos'
import { refreshRealData } from '../../../../lib/realdata'

const json = (body: object, status = 200) => Response.json(body, { status })

/** Upload a club logo: multipart form with "slug" and "file" */
export async function POST(request: Request) {
  const denied = await adminDenied(request)
  if (denied) return json({ error: denied }, 401)
  const form = await request.formData()
  const slug = String(form.get('slug') ?? '')
  const file = form.get('file')
  if (!(file instanceof File) || file.size === 0) return json({ error: 'Vælg en billedfil' }, 400)
  const { error } = saveLogo(slug, Buffer.from(await file.arrayBuffer()))
  if (error) return json({ error }, 400)
  // League logos of API-Sports' leagues travel with the games
  refreshRealData()
  return json({ ok: true })
}

/** Remove an uploaded logo: ?slug=<club> */
export async function DELETE(request: Request) {
  const denied = await adminDenied(request)
  if (denied) return json({ error: denied }, 401)
  removeLogo(new URL(request.url).searchParams.get('slug') ?? '')
  refreshRealData()
  return json({ ok: true })
}
