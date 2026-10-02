import 'server-only'
import { plainText, readingMinutes, type Article } from './articles'
import { paths, SITE_URL } from './site'
import { pathStats } from './visits'

// The facts under each article in /admin/artikler: the text, the page's views, links in and links out.

export interface ArticleStat {
  words: number
  readingMinutes: number
  images: number
  headings: number
  /** Views of the article's page in the last 35 days (src/lib/visits.ts) */
  views: number
  visitors: number
  viewsToday: number
  viewsWeek: number
  /** Other published articles on the site that link to this one */
  linkingArticles: { id: number; title: string }[]
  /** Other sites whose links brought visitors here (search engines and social media not counted) */
  refSites: { site: string; visits: number }[]
  /** Links in the article's text */
  linksOut: number
  linksInternal: number
  linksExternal: number
  externalSites: string[]
  /** The SEO fields */
  metaLength: number
  excerptLength: number
  focusKeyword?: string
  focusInTitle: boolean
  focusInText: boolean
}

const HREF = /<a\s[^>]*?href=["']([^"']+)["']/gi

function siteHost() {
  try {
    return new URL(SITE_URL).host.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** Where a link goes: our own site, another site (with its host), or something else (mail, anchors) */
function classify(href: string): { kind: 'internal' | 'external' | 'other'; host?: string } {
  if (href.startsWith('/') || href.startsWith('#')) return { kind: href.startsWith('#') ? 'other' : 'internal' }
  if (!/^https?:\/\//i.test(href)) return { kind: 'other' }
  try {
    const host = new URL(href).host.replace(/^www\./, '')
    return host === siteHost() ? { kind: 'internal' } : { kind: 'external', host }
  } catch {
    return { kind: 'other' }
  }
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

const count = (html: string, re: RegExp) => (html.match(re) ?? []).length

export function articleStats(list: Article[]): Map<number, ArticleStat> {
  const hrefs = new Map(list.map((a) => [a.id, [...a.content.matchAll(HREF)].map((m) => m[1])]))
  const visits = pathStats(list.map((a) => paths.article(a.slug)))
  const out = new Map<number, ArticleStat>()
  for (const a of list) {
    const path = paths.article(a.slug)
    const mine = hrefs.get(a.id)!
    const kinds = mine.map(classify)
    const v = visits.get(path)
    const text = plainText(a.content)
    const focus = a.focusKeyword?.trim() || undefined
    const has = (s: string) => !!focus && s.toLowerCase().includes(focus.toLowerCase())
    out.set(a.id, {
      words: text.split(' ').filter(Boolean).length,
      readingMinutes: readingMinutes(a.content),
      images: count(a.content, /<img\s/gi),
      headings: count(a.content, /<h[23][\s>]/gi),
      views: v?.views ?? 0,
      visitors: v?.visitors ?? 0,
      viewsToday: v?.today ?? 0,
      viewsWeek: v?.week ?? 0,
      linkingArticles: list.filter((b) => b.id !== a.id && b.status === 'published' && hrefs.get(b.id)!.some((h) => pointsAt(h, path))).map((b) => ({ id: b.id, title: b.title })),
      refSites: v?.refs ?? [],
      linksOut: mine.length,
      linksInternal: kinds.filter((k) => k.kind === 'internal').length,
      linksExternal: kinds.filter((k) => k.kind === 'external').length,
      externalSites: [...new Set(kinds.flatMap((k) => (k.host ? [k.host] : [])))],
      metaLength: (a.metaDescription ?? '').trim().length,
      excerptLength: (a.excerpt ?? '').trim().length,
      focusKeyword: focus,
      focusInTitle: has(a.title),
      focusInText: has(text),
    })
  }
  return out
}
