import { isAdmin, sameOrigin } from '../../../../lib/admin'
import { addCategory, deleteArticle, saveArticle, type ArticleInput } from '../../../../lib/articles'

/** Saves an article ({ article }) or adds a category ({ category: name }) */
export async function POST(request: Request) {
  if (!(await isAdmin()) || !sameOrigin(request)) return Response.json({ error: 'Ikke logget ind' }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as { article?: ArticleInput; category?: string }
  if (typeof body.category === 'string') {
    const { category, error } = addCategory(body.category)
    return error ? Response.json({ error }, { status: 400 }) : Response.json({ category })
  }
  const { article, error } = saveArticle(body.article ?? {})
  return error ? Response.json({ error }, { status: 400 }) : Response.json({ article })
}

/** Deletes an article ({ id }) */
export async function DELETE(request: Request) {
  if (!(await isAdmin()) || !sameOrigin(request)) return Response.json({ error: 'Ikke logget ind' }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as { id?: number }
  if (body.id) deleteArticle(Number(body.id))
  return Response.json({ ok: true })
}
