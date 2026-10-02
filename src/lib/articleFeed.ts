import 'server-only'
import { cleanHtml, publishedArticles, plainText, type Article } from './articles'
import { SITE_NAME, SITE_URL, paths } from './site'

// The articles as RSS (/artikler/feed.xml) and as a Google News sitemap
// (/sitemaps/nyheder.xml). The feed is what Google News Publisher Center,
// Feedly and other readers ask for; the news sitemap tells Google and Bing
// about every article from the last two days at once, which is what Google
// News and Discover read (older articles stay in sider.xml).

const FEED_ITEMS = 30
/** Google's news sitemap takes articles from the last two days only */
const NEWS_HOURS = 48

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const absolute = (url: string) => (url.startsWith('/') ? `${SITE_URL}${url}` : url)
/** Addresses in the article's HTML made absolute, so a reader shows the pictures and links */
const absoluteHtml = (html: string) => html.replace(/(src|href)="\/(?!\/)/g, `$1="${SITE_URL}/`)
const description = (a: Article) => a.excerpt || a.metaDescription || plainText(a.content).slice(0, 300)
const publishedDate = (a: Article) => new Date(a.publishedAt ?? a.updatedAt)

export const feedPath = () => '/artikler/feed.xml'

/** RSS 2.0 of the latest published articles */
export function rssXml(now = new Date()): string {
  const articles = publishedArticles({ limit: FEED_ITEMS }).articles
  const items = articles.map((a) => {
    const url = `${SITE_URL}${paths.article(a.slug)}`
    const image = a.featuredImage && absolute(a.featuredImage)
    return [
      '<item>',
      `<title>${escape(a.title)}</title>`,
      `<link>${escape(url)}</link>`,
      `<guid isPermaLink="true">${escape(url)}</guid>`,
      `<pubDate>${publishedDate(a).toUTCString()}</pubDate>`,
      `<dc:creator>${escape(a.author || SITE_NAME)}</dc:creator>`,
      ...(a.category ? [`<category>${escape(a.category)}</category>`] : []),
      ...a.tags.map((t) => `<category>${escape(t)}</category>`),
      `<description>${escape(description(a))}</description>`,
      ...(image ? [`<enclosure url="${escape(image)}" type="${image.endsWith('.webp') ? 'image/webp' : 'image/jpeg'}" length="0"/>`, `<media:content url="${escape(image)}" medium="image"/>`] : []),
      `<content:encoded><![CDATA[${absoluteHtml(cleanHtml(a.content)).replace(/\]\]>/g, ']]]]><![CDATA[>')}]]></content:encoded>`,
      '</item>',
    ].join('')
  })
  const last = articles[0] ? publishedDate(articles[0]) : now
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:media="http://search.yahoo.com/mrss/" xmlns:atom="http://www.w3.org/2005/Atom">',
    '<channel>',
    `<title>${escape(`${SITE_NAME} – artikler`)}</title>`,
    `<link>${escape(`${SITE_URL}${paths.articles()}`)}</link>`,
    `<atom:link href="${escape(`${SITE_URL}${feedPath()}`)}" rel="self" type="application/rss+xml"/>`,
    '<description>Artikler, optakter og analyser om dansk og international fodbold, ishockey og basketball fra Matchly.</description>',
    '<language>da</language>',
    `<lastBuildDate>${last.toUTCString()}</lastBuildDate>`,
    `<image><url>${escape(`${SITE_URL}/icon-192.png`)}</url><title>${escape(SITE_NAME)}</title><link>${escape(SITE_URL)}</link></image>`,
    ...items,
    '</channel>',
    '</rss>',
    '',
  ].join('\n')
}

/** Google News sitemap: the articles published within the last two days (an empty list is a valid file) */
export function newsSitemapXml(now = new Date()): string {
  const since = now.getTime() - NEWS_HOURS * 3_600_000
  const rows = publishedArticles()
    .articles.filter((a) => publishedDate(a).getTime() >= since)
    .slice(0, 1000)
    .map((a) => {
      const image = a.featuredImage && absolute(a.featuredImage)
      return (
        `<url><loc>${escape(`${SITE_URL}${paths.article(a.slug)}`)}</loc>` +
        `<news:news><news:publication><news:name>${escape(SITE_NAME)}</news:name><news:language>da</news:language></news:publication>` +
        `<news:publication_date>${publishedDate(a).toISOString()}</news:publication_date><news:title>${escape(a.title)}</news:title></news:news>` +
        (image ? `<image:image><image:loc>${escape(image)}</image:loc></image:image>` : '') +
        `</url>`
      )
    })
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n' +
    rows.join('\n') +
    '\n</urlset>\n'
  )
}
