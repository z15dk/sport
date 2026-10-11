import { scoutDrafts } from '../../../../lib/datavagt'
import { editorAllowed } from '../../../../lib/editorAccess'
import { markTrend, pendingTrends } from '../../../../lib/trendWatch'

export const dynamic = 'force-dynamic'

// James' trend hunter (src/lib/trendWatch.ts, deploy/claude-editor/TREND.md): GET → { trends, leftToday } the football
// searches trending in Denmark he has not looked at. POST { action: 'skrevet', id, articleId } (his own draft) or
// { action: 'spring', id, why }.

export async function GET(request: Request) {
  if (!editorAllowed(request)) return Response.json({ error: 'Ingen adgang' }, { status: 401 })
  return Response.json(pendingTrends())
}

export async function POST(request: Request) {
  if (!editorAllowed(request)) return Response.json({ error: 'Ingen adgang' }, { status: 401 })
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const id = typeof b.id === 'string' ? b.id : ''
  if (!id) return Response.json({ error: 'id mangler' }, { status: 400 })
  if (b.action === 'skrevet') {
    const articleId = Number(b.articleId)
    if (!scoutDrafts().some((a) => a.id === articleId)) return Response.json({ error: 'articleId skal være din egen kladde' }, { status: 400 })
    const r = markTrend(id, { articleId })
    return r.error ? Response.json(r, { status: 400 }) : Response.json({ ok: true })
  }
  if (b.action === 'spring') {
    const why = typeof b.why === 'string' ? b.why.trim().slice(0, 300) : ''
    if (!why) return Response.json({ error: 'why skal udfyldes' }, { status: 400 })
    const r = markTrend(id, { why })
    return r.error ? Response.json(r, { status: 400 }) : Response.json({ ok: true })
  }
  return Response.json({ error: 'Brug skrevet eller spring' }, { status: 400 })
}
