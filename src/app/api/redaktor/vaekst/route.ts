import { editorAllowed } from '../../../../lib/editorAccess'
import { indexNowByHand } from '../../../../lib/indexnow'
import { growthBrief, pageBaseline, writeDiary } from '../../../../lib/jamesGrowth'
import { addInternalLink } from '../../../../lib/articleLinks'
import { allArticles, articleById, saveArticle } from '../../../../lib/articles'
import { DAILY_LINKS, judgeSeoOverride, linksToday, logLink, setSeoOverride } from '../../../../lib/seoOverrides'
import { paths } from '../../../../lib/site'

export const dynamic = 'force-dynamic'

// James' daily growth round (deploy/claude-editor/VAEKST.md, the editor's key): GET → the numbers and what he may
// act on (src/lib/jamesGrowth.ts). POST
//   { action: 'titel', path, title?, description?, faq?: [{ q, a }], intro?: { heading, html }, query?, why }  a better
//                                                                  title/description, up to 4 questions for the page's FAQ
//                                                                  and/or his text on a club or league page (Index Now)
//   { action: 'link', id, text, href, why }                        an internal link in one of his own articles: the first
//                                                                  plain mention of `text` links to `href` (10 a day)
//   { action: 'behold' | 'fortryd', path, why }                    the verdict on a title test after 14 days
//   { action: 'dagbog', text, actions: [], ideas: [], numbers? }    today's diary entry, shown on /admin/vaekst (ideas: for the news scout)

export async function GET(request: Request) {
  if (!editorAllowed(request)) return Response.json({ error: 'Ingen adgang' }, { status: 401 })
  // ?links=<ord>&href=<sti>: his own articles that mention the words and don't link to the page yet (for 'link')
  const q = new URL(request.url).searchParams
  const words = q.get('links')?.trim().toLowerCase()
  if (words) {
    const href = q.get('href') ?? ''
    const text = (h: string) => h.replace(/<a\b[\s\S]*?<\/a>|<h[1-6]\b[\s\S]*?<\/h[1-6]>/gi, ' ').replace(/<[^>]+>/g, ' ').toLowerCase()
    const found = allArticles()
      .filter((a) => a.author === 'Matchly' && a.status === 'published' && text(a.content).includes(words) && !(href && a.content.includes(`href="${href}"`)))
      .slice(0, 20)
      .map((a) => ({ id: a.id, title: a.title, path: paths.article(a.slug), category: a.category }))
    return Response.json({ articles: found, linksLeftToday: Math.max(0, DAILY_LINKS - linksToday()) })
  }
  return Response.json(await growthBrief())
}

export async function POST(request: Request) {
  if (!editorAllowed(request)) return Response.json({ error: 'Ingen adgang' }, { status: 401 })
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const str = (v: unknown, max = 400) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
  const pagePath = str(b.path, 200)
  switch (b.action) {
    case 'link': {
      const a = articleById(Number(b.id))
      // Only James' own articles (the news scout's, the previews, the reports and the guides)
      if (!a || a.author !== 'Matchly') return Response.json({ error: 'Kun dine egne artikler' }, { status: 403 })
      if (!str(b.why)) return Response.json({ error: 'Skriv hvorfor (siden og søgningen, du løfter)' }, { status: 400 })
      if (linksToday() >= DAILY_LINKS) return Response.json({ error: `Der er lagt ${DAILY_LINKS} links i dag – resten i morgen` }, { status: 429 })
      const href = str(b.href, 200)
      if (href === paths.article(a.slug)) return Response.json({ error: 'Ikke et link til artiklen selv' }, { status: 400 })
      const r = addInternalLink(a.content, str(b.text, 80), href)
      if (r.error || !r.html) return Response.json({ error: r.error }, { status: 400 })
      const saved = saveArticle({ ...a, content: r.html })
      if (saved.error) return Response.json({ error: saved.error }, { status: 400 })
      logLink(paths.article(a.slug), `"${str(b.text, 80)}" → ${href} (${str(b.why, 200)})`, 'claude')
      if (a.status === 'published') await indexNowByHand([paths.article(a.slug)]).catch(() => undefined)
      return Response.json({ ok: true })
    }
    case 'titel':
    case 'faq': {
      const faq = Array.isArray(b.faq) ? b.faq.slice(0, 10).map((f) => ({ q: str((f as Record<string, unknown>)?.q, 200), a: str((f as Record<string, unknown>)?.a, 600) })) : undefined
      const ir = b.intro && typeof b.intro === 'object' ? (b.intro as Record<string, unknown>) : undefined
      const intro = ir ? { heading: str(ir.heading, 120), html: str(ir.html, 8000) } : undefined
      const r = setSeoOverride({ path: pagePath, title: str(b.title, 80) || undefined, description: str(b.description, 200) || undefined, faq, intro, query: str(b.query, 120) || undefined, why: str(b.why) }, 'claude', await pageBaseline(pagePath))
      if (r.error) return Response.json(r, { status: 400 })
      await indexNowByHand([pagePath]).catch(() => undefined)
      return Response.json({ ok: true })
    }
    case 'behold':
    case 'fortryd': {
      const r = judgeSeoOverride(pagePath, b.action, str(b.why), 'claude')
      if (r.error) return Response.json(r, { status: 400 })
      if (b.action === 'fortryd') await indexNowByHand([pagePath]).catch(() => undefined)
      return Response.json({ ok: true })
    }
    case 'dagbog': {
      const actions = Array.isArray(b.actions) ? b.actions.map((x) => str(x, 300)) : []
      const n = b.numbers as Record<string, unknown> | undefined
      const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
      const ideas = Array.isArray(b.ideas) ? b.ideas.map((x) => str(x, 300)) : []
      const r = writeDiary(str(b.text, 1500), actions, n && { viewsYesterday: num(n.viewsYesterday) ?? 0, viewsDayBefore: num(n.viewsDayBefore) ?? 0, clicks7: num(n.clicks7), impressions7: num(n.impressions7), position7: num(n.position7) }, ideas)
      return r.error ? Response.json(r, { status: 400 }) : Response.json({ ok: true })
    }
    default:
      return Response.json({ error: 'Ukendt handling (titel, behold, fortryd, dagbog)' }, { status: 400 })
  }
}
