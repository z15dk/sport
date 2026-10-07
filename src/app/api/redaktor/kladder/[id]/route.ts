import { articleById, saveArticle } from '../../../../../lib/articles'
import { qualityOf, saveEditorVerdict, saveQuality } from '../../../../../lib/articleQuality'
import { editorAllowed } from '../../../../../lib/editorAccess'

// The Claude editor's change to one automatic draft: new text (title, excerpt, content, metaDescription) and/or
// its verdict. Only an automatic article that is a draft or waiting to go live; the status, the slug, the
// publishing time and everything else stay as they are – the editor can never publish or delete.
// POST { verdict: string, ok: boolean, title?, excerpt?, content?, metaDescription? }

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!editorAllowed(request)) return Response.json({ error: 'Ingen adgang' }, { status: 401 })
  const id = Number((await params).id)
  const a = Number.isInteger(id) ? articleById(id) : undefined
  const mark = a && qualityOf(a.id)
  if (!a || !mark) return Response.json({ error: 'Ikke en automatisk kladde' }, { status: 404 })
  const waiting = a.status === 'draft' || (!!a.publishedAt && Date.parse(a.publishedAt) > Date.now())
  if (!waiting) return Response.json({ error: 'Artiklen er udgivet – den rettes ikke' }, { status: 409 })
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const str = (k: string, max: number) => (typeof b[k] === 'string' && (b[k] as string).trim() ? (b[k] as string).trim().slice(0, max) : undefined)
  const verdict = str('verdict', 600)
  if (!verdict || typeof b.ok !== 'boolean') return Response.json({ error: 'verdict og ok skal med' }, { status: 400 })
  const change = { title: str('title', 200), excerpt: str('excerpt', 400), content: str('content', 60_000), metaDescription: str('metaDescription', 300) }
  if (Object.values(change).some(Boolean)) {
    const r = saveArticle({ ...a, ...Object.fromEntries(Object.entries(change).filter(([, v]) => v)), status: a.status, publishedAt: a.publishedAt, slug: a.slug })
    if (r.error) return Response.json({ error: r.error }, { status: 400 })
    // The text changed after the automatic check: the mark keeps its level, the time moves so the morning check
    // (src/lib/autoPreviews.ts) sees the editor's version as the automatic one and does not call it hand-edited
    saveQuality(a.id, { ...mark, at: Date.now() })
  }
  saveEditorVerdict(a.id, verdict, b.ok)
  return Response.json({ ok: true })
}
