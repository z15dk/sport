import 'server-only'
import { plainText, type Article } from './articles'
import { paths, SITE_URL } from './site'
import { pathStats } from './visits'

// The numbers beside each article in /admin/artikler: words, page views, links in and links out.

export interface ArticleStat {
  words: number
  /** Views and visitors of the article's page in the last 35 days (src/lib/visits.ts) */
  views: number
  visitors: number
  /** Other articles on the site that link to this one */
  linksFromArticles: number
  /** Visits that came by a link from another site (search engines and social media not counted), and those sites */
  refVisits: number
  refDomains: string[]
  /** Links in the article's text, and how many of them go to other sites */
  linksOut: number
  linksExternal: number
}

const HREF = /<a\s[^>]*?href=["']([^"']+)["']/gi

function siteHost() {
  try {
    return new URL(SITE_URL).host.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** The links in an article's HTML: all of them, and the ones leaving the site */
export function articleLinks(html: string): { hrefs: string[]; external: number } {
  const hrefs = [...html.matchAll(HREF)].map((m) => m[1])
  const own = siteHost()
  const external = hrefs.filter((h) => {
    if (!/^https?:\/\//i.test(h)) return false
    try {
      return new URL(h).host.replace(/^www\./, '') !== own
    } catch {
      return false
    }
  }).length
  return { hrefs, external }
}

/** Whether a link points at the article: its path, alone or with the site's address */
function pointsAt(href: string, path: string) {
  const h = href.split(/[?#]/)[0].replace(/\/$/, '')
  if (h === path) return true
  if (!/^https?:\/\//i.test(h)) return false
  try {
    const u = new URL(h)
    return u.host.replace(/^www\./, '') === siteHost() && u.pathname.replace(/\/$/, '') === path
  } catch {
    return false
  }
}

export function articleStats(list: Article[]): Map<number, ArticleStat> {
  const links = new Map(list.map((a) => [a.id, articleLinks(a.content)]))
  const visits = pathStats(list.map((a) => paths.article(a.slug)))
  const out = new Map<number, ArticleStat>()
  for (const a of list) {
    const path = paths.article(a.slug)
    const mine = links.get(a.id)!
    const v = visits.get(path)
    out.set(a.id, {
      words: plainText(a.content).split(' ').filter(Boolean).length,
      views: v?.views ?? 0,
      visitors: v?.visitors ?? 0,
      linksFromArticles: list.filter((b) => b.id !== a.id && b.status === 'published' && links.get(b.id)!.hrefs.some((h) => pointsAt(h, path))).length,
      refVisits: v?.refVisits ?? 0,
      refDomains: v?.refDomains ?? [],
      linksOut: mine.hrefs.length,
      linksExternal: mine.external,
    })
  }
  return out
}
