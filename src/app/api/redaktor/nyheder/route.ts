import { allArticles, articleById, saveArticle, type Article } from '../../../../lib/articles'
import { sendArticleApprovalMail } from '../../../../lib/articleApproval'
import { scoutDrafts } from '../../../../lib/datavagt'
import { editorAllowed } from '../../../../lib/editorAccess'
import { seoChecks } from '../../../../lib/seoChecks'
import { indexNowByHand } from '../../../../lib/indexnow'
import { mailErrorText, sendMail } from '../../../../lib/mail'
import { SITE_URL, paths } from '../../../../lib/site'
import { setSocialCaption } from '../../../../lib/socialCaptions'
import { makeClubGraphic, makeLeagueGraphic, makeResultGraphic, makeTextGraphic, makeVsGraphic, RESULT_VARIANTS_IN_USE } from '../../../../lib/vsGraphic'

export const dynamic = 'force-dynamic'

// The news scout on the server (deploy/claude-editor/NYHEDER.md, same key as the editor): it reads what Matchly
// already has, saves its own news drafts and mails them to the owner. It can never publish: every save is a
// draft without a publishing time or picture, and it can only change its own drafts from the last day
// (scoutDrafts in src/lib/datavagt.ts: author "Matchly", no automatic quality mark).
// GET → { articles } (the newest 40, without text); GET ?id=<id> → one of its own drafts in full.
// POST { action: 'gem', article } → { article, checks } (the editor's checklist); POST { action: 'mail', ids } sends the approval mail.
// POST { action: 'billede', id, kind: 'resultat'|'vs'|'tekst'|'klub'|'liga', home, away, hs, as, homeGoals, awayGoals, variant, headline, top, title, sub, club, league, alt } makes the
// draft's picture – Matchly's own graphics only, never a photo; POST { action: 'opslag', id, text } is its social post text.
// POST { action: 'opdater', id, content, title?, excerpt?, seoTitle?, metaDescription?, why } brings a statistics article
// (category Statistik, also a published one) up to date – once in six days, no red points, the owner gets a mail.
// GET ?id= also gives a statistics article in full.

const CATEGORIES = ['Nyheder', 'Optakter', 'Referater']
const own = (id: number) => scoutDrafts().find((a) => a.id === id)
/** The statistics articles (category Statistik) James keeps fresh with new numbers – also once they are published */
const statArticle = (id: number) => {
  const a = articleById(id)
  return a && a.category === 'statistik' ? a : undefined
}
const UPDATE_GAP = 6 * 86_400_000
const brief = (a: Article) => ({ id: a.id, slug: a.slug, title: a.title, status: a.status, category: a.category, tags: a.tags, publishedAt: a.publishedAt, createdAt: a.createdAt })

export async function GET(request: Request) {
  if (!editorAllowed(request)) return Response.json({ error: 'Ingen adgang' }, { status: 401 })
  const id = Number(new URL(request.url).searchParams.get('id'))
  if (id) {
    const a = own(id) ?? statArticle(id)
    return a ? Response.json({ article: a, checks: seoChecks(a) }) : Response.json({ error: 'Ikke en af dine kladder eller en statistik-artikel' }, { status: 404 })
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
  if (b.action === 'opdater') {
    // A statistics article with this week's numbers: text, title, lead and description only – slug, status, time,
    // picture and tags stay; at most once in six days; the owner gets a short mail and search engines are told
    const x = b as Record<string, unknown>
    const id = Number(x.id)
    const a = statArticle(id)
    if (!a) return Response.json({ error: 'Kun artikler i kategorien Statistik' }, { status: 403 })
    const t = (k: string, max: number) => (typeof x[k] === 'string' ? (x[k] as string).trim().slice(0, max) : '')
    const why = t('why', 300)
    const content = t('content', 60_000)
    if (!why || content.length < 500) return Response.json({ error: 'content (hele teksten) og why skal udfyldes' }, { status: 400 })
    if (Date.now() - Date.parse(a.updatedAt) < UPDATE_GAP) return Response.json({ error: 'Artiklen er opdateret inden for de seneste 6 dage' }, { status: 409 })
    const next = { ...a, content, title: t('title', 200) || a.title, excerpt: t('excerpt', 400) || a.excerpt, seoTitle: t('seoTitle', 70) || a.seoTitle, metaDescription: t('metaDescription', 200) || a.metaDescription }
    const red = seoChecks(next).filter((c) => c.level === 'bad' && c.id !== 'image')
    if (red.length) return Response.json({ error: 'Tjeklisten har røde punkter', red: red.map((c) => c.text) }, { status: 422 })
    const saved = saveArticle(next)
    if (saved.error || !saved.article) return Response.json({ error: saved.error ?? 'Kunne ikke gemme' }, { status: 400 })
    if (a.status === 'published') await indexNowByHand([paths.article(a.slug)]).catch(() => undefined)
    await sendMail(`Matchly: James har opdateret "${a.title}"`, `<p>James har opdateret <a href="${SITE_URL}${paths.article(a.slug)}">${a.title}</a> med nye tal.</p><p>${why}</p>`, `James har opdateret "${a.title}": ${why}\n${SITE_URL}${paths.article(a.slug)}`).catch(() => undefined)
    return Response.json({ ok: true, article: brief(saved.article) })
  }
  if (b.action === 'billede' || b.action === 'opslag') {
    const x = b as Record<string, unknown>
    const id = Number(x.id)
    const draft = own(id)
    if (!draft) return Response.json({ error: 'Kun dine egne kladder fra det seneste døgn' }, { status: 403 })
    const t = (k: string, max = 140) => (typeof x[k] === 'string' ? (x[k] as string).trim().slice(0, max) : '')
    if (b.action === 'opslag') {
      const r = setSocialCaption(id, t('text', 600), 'claude')
      return r.error ? Response.json(r, { status: 400 }) : Response.json({ ok: true })
    }
    try {
      const kind = t('kind', 10)
      const score = (k: string) => (typeof x[k] === 'number' && Number.isInteger(x[k]) && (x[k] as number) >= 0 && (x[k] as number) < 30 ? (x[k] as number) : undefined)
      const lines = (k: string) => (Array.isArray(x[k]) ? (x[k] as unknown[]).filter((v): v is string => typeof v === 'string').slice(0, 8).map((v) => v.trim().slice(0, 40)) : [])
      const hs = score('hs')
      const as = score('as')
      const made =
        kind === 'resultat' && t('home') && t('away') && hs !== undefined && as !== undefined
          ? await makeResultGraphic({ home: t('home', 60), away: t('away', 60), hs, as, top: t('top', 80) || undefined, homeGoals: lines('homeGoals'), awayGoals: lines('awayGoals'), variant: RESULT_VARIANTS_IN_USE.find((v) => v === t('variant', 20)), headline: t('headline', 70) || undefined })
          : kind === 'vs' && t('home') && t('away')
          ? await makeVsGraphic({ home: t('home', 60), away: t('away', 60), top: t('top', 80) || undefined })
          : kind === 'klub' && t('club')
            ? await makeClubGraphic({ club: t('club', 60) })
            : kind === 'liga' && t('league')
              ? await makeLeagueGraphic({ league: t('league', 60) })
              : kind === 'tekst' && t('title')
                ? await makeTextGraphic({ title: t('title', 120), top: t('top', 80) || undefined, sub: t('sub') || undefined })
                : undefined
      if (!made) return Response.json({ error: 'Brug kind "resultat" (home, away, hs, as, top, homeGoals, awayGoals, variant, headline), "vs" (home, away, top), "klub" (club), "liga" (league) eller "tekst" (title, top, sub)' }, { status: 400 })
      const saved = saveArticle({ ...draft, featuredImage: made.url, featuredAlt: t('alt', 160) || draft.title })
      return saved.error ? Response.json({ error: saved.error }, { status: 400 }) : Response.json({ ok: true, url: made.url })
    } catch (e) {
      return Response.json({ error: e instanceof Error ? e.message : 'Billedet kunne ikke laves' }, { status: 400 })
    }
  }
  if (b.action !== 'gem' || !b.article) return Response.json({ error: 'Brug { action: "gem", article }, "mail", "billede" eller "opslag"' }, { status: 400 })
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
