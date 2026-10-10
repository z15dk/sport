import { articleById, saveArticle } from '../../../../lib/articles'
import { publishDraft } from '../../../../lib/articleApproval'
import { scoutDrafts } from '../../../../lib/datavagt'
import { editorAllowed } from '../../../../lib/editorAccess'
import { indexNowByHand } from '../../../../lib/indexnow'
import { markPreview, pendingPreviews, previewArticle } from '../../../../lib/jamesPreviews'
import { seoChecks } from '../../../../lib/seoChecks'
import { SITE_URL, paths } from '../../../../lib/site'

export const dynamic = 'force-dynamic'

// James' match previews (src/lib/jamesPreviews.ts, deploy/claude-editor/OPTAKT.md): GET → { matches } the Danish matches
// in 2–36 hours without a preview. POST { action: 'skrevet', slug, id } marks one written (id: his draft); { action:
// 'spring', slug, why } skips one; { action: 'udgiv', slug } publishes his preview (the owner's word 10/10-2026): only his
// own draft for the match, in category Kampoptakter, with a picture and nothing red on the checklist – never on Facebook
// (noSocial), not in the article lists; Index Now. The owner gets the day's list in one mail (src/lib/jamesDigest.ts).

export async function GET(request: Request) {
  if (!editorAllowed(request)) return Response.json({ error: 'Ingen adgang' }, { status: 401 })
  return Response.json({ matches: pendingPreviews() })
}

export async function POST(request: Request) {
  if (!editorAllowed(request)) return Response.json({ error: 'Ingen adgang' }, { status: 401 })
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const slug = typeof b.slug === 'string' ? b.slug.trim() : ''
  if (!/^[a-z0-9-]+$/.test(slug)) return Response.json({ error: 'slug mangler' }, { status: 400 })
  if (b.action === 'skrevet') {
    const id = Number(b.id)
    const a = scoutDrafts().find((x) => x.id === id)
    if (!a) return Response.json({ error: 'id skal være din egen kladde' }, { status: 400 })
    if (a.category?.toLowerCase() !== 'kampoptakter') return Response.json({ error: 'Optakten skal have kategorien "Kampoptakter"' }, { status: 400 })
    const r = markPreview(slug, id)
    return r.error ? Response.json(r, { status: 400 }) : Response.json({ ok: true })
  }
  if (b.action === 'spring') {
    if (typeof b.why !== 'string' || !b.why.trim()) return Response.json({ error: 'why skal udfyldes' }, { status: 400 })
    const r = markPreview(slug, 0, b.why.trim().slice(0, 300))
    return r.error ? Response.json(r, { status: 400 }) : Response.json({ ok: true })
  }
  if (b.action === 'udgiv') {
    const id = previewArticle(slug)
    const a = id ? articleById(id) : undefined
    if (!a || a.status !== 'draft' || a.category?.toLowerCase() !== 'kampoptakter') return Response.json({ error: 'Kun din egen optakt til kampen (markeret skrevet) som kladde' }, { status: 400 })
    if (!a.featuredImage) return Response.json({ error: 'Optakten mangler sit billede (VS-grafik)' }, { status: 422 })
    const red = seoChecks(a).filter((c) => c.level === 'bad')
    if (red.length) return Response.json({ error: 'Tjeklisten har røde punkter', red: red.map((c) => c.text) }, { status: 422 })
    // Never on Facebook
    if (!a.noSocial) saveArticle({ ...a, noSocial: true })
    const r = publishDraft(a.id, 'now')
    if (r.error || !r.article) return Response.json({ error: r.error ?? 'Kunne ikke udgive' }, { status: 400 })
    await indexNowByHand([paths.article(a.slug)]).catch(() => undefined)
    return Response.json({ ok: true, url: `${SITE_URL}${paths.article(a.slug)}` })
  }
  return Response.json({ error: 'Brug skrevet, spring eller udgiv' }, { status: 400 })
}
