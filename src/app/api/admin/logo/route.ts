import { isAdmin, sameOrigin } from '../../../../lib/admin'
import { removeLogo, saveLogo } from '../../../../lib/customLogos'

const json = (body: object, status = 200) => Response.json(body, { status })

/** Upload a club logo: multipart form with "slug" and "file" */
export async function POST(request: Request) {
  if (!(await isAdmin()) || !sameOrigin(request)) return json({ error: 'Ikke logget ind' }, 401)
  const form = await request.formData()
  const slug = String(form.get('slug') ?? '')
  const file = form.get('file')
  if (!(file instanceof File) || file.size === 0) return json({ error: 'Vælg en billedfil' }, 400)
  const { error } = saveLogo(slug, Buffer.from(await file.arrayBuffer()))
  return error ? json({ error }, 400) : json({ ok: true })
}

/** Remove an uploaded logo: ?slug=<club> */
export async function DELETE(request: Request) {
  if (!(await isAdmin()) || !sameOrigin(request)) return json({ error: 'Ikke logget ind' }, 401)
  removeLogo(new URL(request.url).searchParams.get('slug') ?? '')
  return json({ ok: true })
}
