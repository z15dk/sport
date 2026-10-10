import { articleById } from '../../../../lib/articles'
import { publishDraft } from '../../../../lib/articleApproval'
import { scoutDrafts } from '../../../../lib/datavagt'
import { editorAllowed } from '../../../../lib/editorAccess'
import { fastReportArticle, fastReportSocial, markFastReport, pendingFastReports } from '../../../../lib/fastReports'
import { saveArticle } from '../../../../lib/articles'
import { indexNowByHand } from '../../../../lib/indexnow'
import { sendMail } from '../../../../lib/mail'
import { seoChecks } from '../../../../lib/seoChecks'
import { SITE_URL, paths } from '../../../../lib/site'

export const dynamic = 'force-dynamic'

// James' fast match reports (src/lib/fastReports.ts, the referat round in deploy/claude-editor/NYHEDER.md):
// GET → { matches } the finished Danish matches (src/lib/danishMatches.ts) he should write a report on now.
// POST { action: 'skrevet', slug, id } marks one written (id: his report draft); { action: 'spring', slug, why } skips one;
// { action: 'udgiv', slug } publishes the report written for the match (the owner's word 9/10-2026): only that draft,
// in category Referater, with a picture and nothing red on the checklist – Index Now; the Superliga's and 1. division's also out on
// Facebook with a short mail to the owner, the rest only on the site (in the daily list).

export async function GET(request: Request) {
  if (!editorAllowed(request)) return Response.json({ error: 'Ingen adgang' }, { status: 401 })
  return Response.json({ matches: pendingFastReports() })
}

export async function POST(request: Request) {
  if (!editorAllowed(request)) return Response.json({ error: 'Ingen adgang' }, { status: 401 })
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const slug = typeof b.slug === 'string' ? b.slug.trim() : ''
  if (!/^[a-z0-9-]+$/.test(slug)) return Response.json({ error: 'slug mangler' }, { status: 400 })
  if (b.action === 'skrevet') {
    const id = Number(b.id)
    if (!scoutDrafts().some((a) => a.id === id)) return Response.json({ error: 'id skal være din egen kladde' }, { status: 400 })
    const r = markFastReport(slug, id)
    return r.error ? Response.json(r, { status: 400 }) : Response.json({ ok: true })
  }
  if (b.action === 'spring') {
    if (typeof b.why !== 'string' || !b.why.trim()) return Response.json({ error: 'why skal udfyldes' }, { status: 400 })
    const r = markFastReport(slug, 0)
    return r.error ? Response.json(r, { status: 400 }) : Response.json({ ok: true })
  }
  if (b.action === 'udgiv') {
    const id = fastReportArticle(slug)
    const a = id ? articleById(id) : undefined
    if (!a || a.status !== 'draft' || a.category?.toLowerCase() !== 'referater') return Response.json({ error: 'Kun dit eget referat til kampen (markeret skrevet) som kladde' }, { status: 400 })
    if (!a.featuredImage) return Response.json({ error: 'Referatet mangler sin resultatgrafik' }, { status: 422 })
    const red = seoChecks(a).filter((c) => c.level === 'bad')
    if (red.length) return Response.json({ error: 'Tjeklisten har røde punkter', red: red.map((c) => c.text) }, { status: 422 })
    // Only the Superliga's and 1. division's reports go out on Facebook; the rest stay on the site (the owner's word 10/10-2026)
    const social = fastReportSocial(slug)
    if (!social && !a.noSocial) saveArticle({ ...a, noSocial: true })
    const r = publishDraft(a.id, 'now')
    if (r.error || !r.article) return Response.json({ error: r.error ?? 'Kunne ikke udgive' }, { status: 400 })
    const url = `${SITE_URL}${paths.article(a.slug)}`
    await indexNowByHand([paths.article(a.slug)]).catch(() => undefined)
    // A mail for each Facebook report as before; the others come in the daily list (src/lib/jamesDigest.ts)
    if (social) await sendMail(`Matchly: James har udgivet "${a.title}"`, `<p>James har udgivet referatet <a href="${url}">${a.title}</a>. Det går også ud på Facebook.</p>`, `James har udgivet referatet "${a.title}": ${url}`).catch(() => undefined)
    return Response.json({ ok: true, url })
  }
  return Response.json({ error: 'Brug skrevet, spring eller udgiv' }, { status: 400 })
}
