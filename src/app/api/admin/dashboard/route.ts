import { isAdmin } from '../../../../lib/admin'
import { visitStats, liveVisitors } from '../../../../lib/visits'
import { jamesStatus } from '../../../../lib/jamesStatus'
import { siteSettings } from '../../../../lib/settings'
import { SETTINGS } from '../../../../data/settingsDef'
import { newsStatus, newsFeeds } from '../../../../lib/news'
import { indexNowStatus, indexNowLog } from '../../../../lib/indexnow'
import { allArticles, categories } from '../../../../lib/articles'
import { articleStats } from '../../../../lib/articleStats'
import { readQuality } from '../../../../lib/articleQuality'
import { readEditorRules } from '../../../../lib/editorRules'
import { readDatavagt } from '../../../../lib/datavagt'
import { readRettelser } from '../../../../lib/rettelser'
import { matchOverrides } from '../../../../lib/matchOverrides'
import { PLATFORMS, PLATFORM_NAMES, KIND_NAMES, STATUS_NAMES, readPosts, socialConfig } from '../../../../lib/socialStore'
import { connected } from '../../../../lib/socialPlatforms'
import { GOAL_PER_DAY, growthTasks, searchConsole, siteViews } from '../../../../lib/growth'
import { readDiary } from '../../../../lib/jamesGrowth'
import { readSeoOverrides } from '../../../../lib/seoOverrides'
import { widgetStats } from '../../../../lib/widgetStats'
import { adStats } from '../../../../lib/adStats'
import { ticketStats } from '../../../../lib/tickets'
import { paths } from '../../../../lib/site'

export const dynamic = 'force-dynamic'

// Admin-data som JSON til Runes dashboard (crmm). Kun for en logget-ind admin (samme cookie som /admin).
// GET /api/admin/dashboard?side=oversigt|artikler|redaktoer|datavagt|sociale|vaekst|statistik
// Ændringer laves stadig gennem de eksisterende /api/admin/*-ruter. Hemmeligheder (tokens, koder) sendes aldrig med.

type Handler = (q: URLSearchParams) => unknown | Promise<unknown>

const sides: Record<string, Handler> = {
  async oversigt(q) {
    const period = Math.max(1, Math.min(365, Number(q.get('periode')) || 1))
    const { settings } = siteSettings()
    return {
      visits: visitStats(period) ?? null,
      live: liveVisitors(5),
      james: await jamesStatus(),
      settings: SETTINGS.map((s) => ({ ...s, value: (settings as Record<string, unknown>)[s.key] })),
      news: { status: newsStatus(), feeds: newsFeeds() },
      indexNow: indexNowStatus(),
    }
  },

  artikler() {
    const all = allArticles()
    const stats = articleStats(all)
    const quality = readQuality()
    return {
      categories: categories(),
      articles: all.map((a) => {
        const s = stats.get(a.id)
        return {
          id: a.id, slug: a.slug, title: a.title, excerpt: a.excerpt, status: a.status, category: a.category ?? null,
          tags: a.tags, author: a.author, publishedAt: a.publishedAt ?? null, updatedAt: a.updatedAt, createdAt: a.createdAt,
          featuredImage: a.featuredImage ?? null, noSocial: a.noSocial, url: paths.article(a.slug),
          stats: s ? { words: s.words, views: s.views, visitors: s.visitors, viewsToday: s.viewsToday, viewsWeek: s.viewsWeek } : null,
          quality: quality[String(a.id)] ?? null,
        }
      }),
    }
  },

  redaktoer() {
    return { rules: readEditorRules(), quality: readQuality() }
  },

  datavagt() {
    return { report: readDatavagt(), rettelser: readRettelser(), overrides: matchOverrides().overrides }
  },

  sociale() {
    const cfg = socialConfig()
    const data = readPosts()
    const now = Date.now()
    return {
      enabled: cfg.enabled,
      dryRun: cfg.dryRun,
      platforms: PLATFORMS.map((p) => ({ id: p, name: PLATFORM_NAMES[p], on: !!cfg.platforms?.[p], connected: connected(p) })),
      kindNames: KIND_NAMES,
      statusNames: STATUS_NAMES,
      // Kommende og nyeste opslag (uden billedfiler og resultat-detaljer)
      posts: data.posts
        .filter((p) => p.scheduledAt > now - 3 * 86_400_000)
        .sort((a, b) => a.scheduledAt - b.scheduledAt)
        .slice(0, 150)
        .map((p) => ({
          id: p.id, date: p.date, kind: p.kind, title: p.title, caption: p.caption, link: p.link, status: p.status,
          approval: p.approval, scheduledAt: p.scheduledAt, publishedAt: p.publishedAt ?? null, images: p.images.length,
          note: p.note ?? null, renderError: p.renderError ?? null,
          results: Object.fromEntries(Object.entries(p.results ?? {}).map(([k, r]) => [k, { ok: !!(r as { ok?: boolean }).ok }])),
        })),
    }
  },

  vaekst() {
    return {
      goalPerDay: GOAL_PER_DAY,
      views: siteViews(),
      searchConsole: searchConsole() ?? null,
      tasks: growthTasks(),
      diary: readDiary().slice(-14).reverse(),
      seoOverrides: readSeoOverrides(),
      indexNowLog: indexNowLog().slice(-30).reverse(),
    }
  },

  statistik() {
    return { widget: widgetStats(30), ads: adStats(30), tickets: ticketStats() }
  },
}

export async function GET(request: Request) {
  if (!(await isAdmin())) return Response.json({ error: 'Ikke logget ind' }, { status: 401 })
  const q = new URL(request.url).searchParams
  const side = q.get('side') ?? ''
  const handler = sides[side]
  if (!handler) return Response.json({ error: 'Ukendt side', sider: Object.keys(sides) }, { status: 404 })
  try {
    const data = await handler(q)
    return Response.json({ side, at: new Date().toISOString(), data }, { headers: { 'cache-control': 'no-store' } })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
