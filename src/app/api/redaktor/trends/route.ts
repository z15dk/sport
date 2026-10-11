import { publishDraft } from '../../../../lib/articleApproval'
import { articleById, saveArticle } from '../../../../lib/articles'
import { scoutDrafts } from '../../../../lib/datavagt'
import { editorAllowed } from '../../../../lib/editorAccess'
import { indexNowByHand } from '../../../../lib/indexnow'
import { sendMail } from '../../../../lib/mail'
import { seoChecks } from '../../../../lib/seoChecks'
import { SITE_URL, paths } from '../../../../lib/site'
import { markTrend, pendingTrends, trendArticle } from '../../../../lib/trendWatch'

export const dynamic = 'force-dynamic'

// James' trend hunter (src/lib/trendWatch.ts, deploy/claude-editor/TREND.md): GET → { trends, leftToday } the football
// searches trending in Denmark he has not looked at. POST { action: 'skrevet', id, articleId } (his own draft) or
// { action: 'spring', id, why }; { action: 'udgiv', id } publishes his news on it himself (the owner's word 11/10-2026):
// only his own draft marked written for the search, with a picture and nothing red – on the site and Index Now, not on
// Facebook (noSocial); the owner gets a short mail.

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
  if (b.action === 'udgiv') {
    const articleId = trendArticle(id)
    const a = articleId ? articleById(articleId) : undefined
    if (!a || a.status !== 'draft') return Response.json({ error: 'Kun din egen kladde til trenden (markeret skrevet)' }, { status: 400 })
    if (!a.featuredImage) return Response.json({ error: 'Artiklen mangler sit billede' }, { status: 422 })
    const red = seoChecks(a).filter((c) => c.level === 'bad')
    if (red.length) return Response.json({ error: 'Tjeklisten har røde punkter', red: red.map((c) => c.text) }, { status: 422 })
    if (!a.noSocial) saveArticle({ ...a, noSocial: true })
    const r = publishDraft(a.id, 'now')
    if (r.error || !r.article) return Response.json({ error: r.error ?? 'Kunne ikke udgive' }, { status: 400 })
    const url = `${SITE_URL}${paths.article(a.slug)}`
    await indexNowByHand([paths.article(a.slug)]).catch(() => undefined)
    const title = a.title.replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`)
    await sendMail(`Matchly: James har udgivet "${a.title}"`, `<p>Danskerne søger på det lige nu, så James har udgivet <a href="${url}">${title}</a>. Den står kun på sitet, ikke på Facebook.</p>`, `James har udgivet "${a.title}" (trend): ${url}`).catch(() => undefined)
    return Response.json({ ok: true, url })
  }
  return Response.json({ error: 'Brug skrevet, spring eller udgiv' }, { status: 400 })
}
