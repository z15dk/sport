import { allArticles, articleById, saveArticle, type Article } from '../../../../lib/articles'
import { sendArticleApprovalMail } from '../../../../lib/articleApproval'
import { scoutDrafts } from '../../../../lib/datavagt'
import { editorAllowed } from '../../../../lib/editorAccess'
import { mailErrorText } from '../../../../lib/mail'
import { seoChecks } from '../../../../lib/seoChecks'

export const dynamic = 'force-dynamic'

// The news scout on the server (deploy/claude-editor/NYHEDER.md, same key as the editor): it reads what Matchly
// already has, saves its own news drafts and mails them to the owner. It can never publish: every save is a
// draft without a publishing time or picture, and it can only change its own drafts from the last day
// (scoutDrafts in src/lib/datavagt.ts: author "Matchly", no automatic quality mark).
// GET → { articles } (the newest 40, without text); GET ?id=<id> → one of its own drafts in full.
// POST { action: 'gem', article } → { article, checks } (the editor's checklist); POST { action: 'mail', ids } sends the approval mail.

const CATEGORIES = ['Nyheder', 'Optakter']
const own = (id: number) => scoutDrafts().find((a) => a.id === id)
const brief = (a: Article) => ({ id: a.id, slug: a.slug, title: a.title, status: a.status, category: a.category, tags: a.tags, publishedAt: a.publishedAt, createdAt: a.createdAt })

export async function GET(request: Request) {
  if (!editorAllowed(request)) return Response.json({ error: 'Ingen adgang' }, { status: 401 })
  const id = Number(new URL(request.url).searchParams.get('id'))
  if (id) {
    const a = own(id)
    return a ? Response.json({ article: a, checks: seoChecks(a) }) : Response.json({ error: 'Ikke en af dine kladder' }, { status: 404 })
  }
  const articles = allArticles()
    .sort((a, b) => (b.publishedAt ?? b.createdAt).localeCompare(a.publishedAt ?? a.createdAt))
    .slice(0, 40)
    .map(brief)
  return Response.json({ articles })
}

export async function POST(request: Request) {
  if (!editorAllowed(request)) return Response.json({ error: 'Ingen adgang' }, { status: 401 })
  const b = (await request.json().catch(() => ({}))) as { action?: string; article?: Record<string, unknown>; ids?: unknown }
  if (b.action === 'mail') {
    const ids = (Array.isArray(b.ids) ? b.ids.map(Number) : []).filter((id) => own(id))
    if (!ids.length) return Response.json({ error: 'Ingen af dine kladder fra det seneste døgn' }, { status: 400 })
    try {
      const r = await sendArticleApprovalMail(ids)
      return Response.json({ ok: true, ids, accepted: r.accepted })
    } catch (e) {
      return Response.json({ error: mailErrorText(e) }, { status: 400 })
    }
  }
  if (b.action !== 'gem' || !b.article) return Response.json({ error: 'Brug { action: "gem", article } eller { action: "mail", ids }' }, { status: 400 })
  const a = b.article
  const str = (k: string) => (typeof a[k] === 'string' ? (a[k] as string) : undefined)
  const id = a.id === undefined ? undefined : Number(a.id)
  if (id !== undefined && !own(id)) return Response.json({ error: 'Du kan kun rette dine egne kladder fra det seneste døgn' }, { status: 403 })
  const category = str('category') ?? 'Nyheder'
  if (!CATEGORIES.includes(category)) return Response.json({ error: `Kategorien skal være ${CATEGORIES.join(' eller ')}` }, { status: 400 })
  const saved = saveArticle({
    ...(id ? { id, featuredImage: articleById(id)?.featuredImage, featuredAlt: articleById(id)?.featuredAlt } : {}),
    slug: str('slug'),
    title: str('title'),
    excerpt: str('excerpt'),
    content: str('content'),
    category,
    tags: Array.isArray(a.tags) ? a.tags.map(String) : [],
    focusKeyword: str('focusKeyword'),
    seoTitle: str('seoTitle'),
    metaDescription: str('metaDescription'),
    author: 'Matchly',
    status: 'draft',
  })
  if (saved.error || !saved.article) return Response.json({ error: saved.error ?? 'Kunne ikke gemme' }, { status: 400 })
  return Response.json({ article: brief(saved.article), checks: seoChecks(saved.article).map((c) => `${c.level === 'good' ? 'grøn' : c.level === 'ok' ? 'gul' : 'rød'}: ${c.text}`) })
}
