import { allArticles } from '../../../../lib/articles'
import { readQuality } from '../../../../lib/articleQuality'
import { editorAllowed } from '../../../../lib/editorAccess'

export const dynamic = 'force-dynamic'

// The Claude editor's list (src/lib/editorAccess.ts): the automatic previews and match reports that are still
// drafts or waiting to go live and that the editor has not read yet (?alle=1: also those it has read).

export async function GET(request: Request) {
  if (!editorAllowed(request)) return Response.json({ error: 'Ingen adgang' }, { status: 401 })
  const all = new URL(request.url).searchParams.get('alle') === '1'
  const marks = readQuality()
  const now = Date.now()
  const drafts = allArticles()
    .filter((a) => marks[String(a.id)] && (a.status === 'draft' || (a.publishedAt && Date.parse(a.publishedAt) > now)))
    .filter((a) => all || !marks[String(a.id)].editor)
    .map((a) => ({ id: a.id, slug: a.slug, status: a.status, title: a.title, excerpt: a.excerpt, seoTitle: a.seoTitle, metaDescription: a.metaDescription, content: a.content, quality: marks[String(a.id)] }))
  return Response.json({ drafts })
}
