import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { photoCredits, withPhotoCredits } from '../../../lib/photos/server'
import { articleBySlug, articleBySlugAny, categoryName, cleanHtml, plainText, publishedArticles, readingMinutes } from '../../../lib/articles'
import { slugify } from '../../../lib/slug'
import { JsonLd, articleFaqLd, articleLd, breadcrumbLd } from '../../../lib/jsonld'
import { SITE_NAME, SITE_URL, paths } from '../../../lib/site'
import { feedPath } from '../../../lib/articleFeed'
import { formatLong, formatTime } from '../../../lib/time'
import { ArticleCards } from '../../../components/ArticleList'
import { AdSlot } from '../../../components/AdSlot'
import { ArticleSide, articleSubject } from '../../../components/ArticleSide'
import { ShareRow } from '../../../components/ShareRow'
import { loadRealData } from '../../../lib/realdata'
import { isAdmin } from '../../../lib/admin'
import { expandWidgets, markNumberColumns, styleFaq, styleResult } from '../../../lib/articleEmbeds'
import Script from 'next/script'

export const dynamic = 'force-dynamic'

type Params = Promise<{ slug: string }>

const describe = (a: { metaDescription?: string; excerpt: string; content: string }) => (a.metaDescription || a.excerpt || plainText(a.content).slice(0, 157) + '…').trim()
const absolute = (url?: string) => (url?.startsWith('/') ? `${SITE_URL}${url}` : url)
/** The share picture: an uploaded picture as /delingsbillede/<name>.jpg, else the site's own */
const shareImage = (featured?: string) => {
  const m = featured && /^\/uploads\/([a-f0-9]{24})\.webp$/.exec(featured)
  return m ? `/delingsbillede/${m[1]}.jpg` : featured && /^https?:\/\//.test(featured) ? featured : '/opengraph-image'
}

/** The live article, or for a logged-in admin also a draft or a scheduled one (a preview, never indexed) */
async function load(slug: string): Promise<{ a: ReturnType<typeof articleBySlugAny> & {}; preview: boolean } | undefined> {
  const live = articleBySlug(slug)
  if (live) return { a: live, preview: false }
  if (!(await isAdmin())) return undefined
  const any = articleBySlugAny(slug)
  return any && { a: any, preview: true }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const found = await load((await params).slug)
  if (!found) return { title: 'Artikel' }
  const { a } = found
  if (found.preview) return { title: `Forhåndsvisning: ${a.seoTitle || a.title}`, robots: { index: false, follow: false } }
  const description = describe(a)
  return {
    title: a.seoTitle || a.title,
    description,
    alternates: { canonical: paths.article(a.slug), types: { 'application/rss+xml': feedPath() } },
    keywords: [a.focusKeyword, ...a.tags].filter((x): x is string => !!x),
    openGraph: {
      type: 'article',
      title: a.seoTitle || a.title,
      description,
      url: paths.article(a.slug),
      publishedTime: a.publishedAt,
      modifiedTime: a.updatedAt,
      tags: a.tags,
      // A 1200×630 JPEG for sharing (many apps show no preview for WebP); without a picture the site's own share image
      images: [{ url: absolute(shareImage(a.featuredImage))!, width: 1200, height: 630, type: shareImage(a.featuredImage).endsWith('.jpg') ? 'image/jpeg' : 'image/png', alt: a.featuredAlt ?? a.title }],
    },
    twitter: { card: 'summary_large_image', images: [absolute(shareImage(a.featuredImage))!] },
  }
}

export default async function ArticlePage({ params }: { params: Params }) {
  const found = await load((await params).slug)
  if (!found) notFound()
  const { a, preview } = found
  loadRealData()
  const now = Date.now()
  const category = categoryName(a.category)
  // The photographer stands in the bottom right corner of every picture from the photo archive
  // Our league table widget where the text has a [tabel …] code, and number columns centred
  const { html: body, used: hasWidget } = expandWidgets(markNumberColumns(withPhotoCredits(styleResult(cleanHtml(a.content)))))
  // The questions at the end as their own box (the search engines get them as FAQPage from the plain text)
  const html = styleFaq(body)
  const faqLd = articleFaqLd(body)
  const heroCredit = photoCredits([a.featuredImage]).get(a.featuredImage ?? '')
  const more = publishedArticles({ limit: 4 }).articles.filter((x) => x.id !== a.id).slice(0, 3)
  const published = a.publishedAt ? new Date(a.publishedAt) : undefined
  const updated = new Date(a.updatedAt)
  const changedLater = published && updated.getTime() - published.getTime() > 3_600_000
  // The league or club the article is about: its table and next matches stand beside the text
  const subject = articleSubject(a, category)
  const url = `${SITE_URL}${paths.article(a.slug)}`
  // A preview whose match is over says so at the top, with the match report when Matchly has written it
  const previewDate = a.slug.startsWith('optakt-') ? a.slug.slice(-10) : undefined
  const played = !!previewDate && /^\d{4}-\d{2}-\d{2}$/.test(previewDate) && previewDate < new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Copenhagen' })
  const report = played ? articleBySlug(a.slug.replace(/^optakt-/, 'referat-')) : undefined
  return (
    <div className="page article-page">
      {preview && (
        <p className="article-preview" role="status">
          <strong>Forhåndsvisning</strong> · {a.status === 'published' ? `planlagt til ${formatLong(new Date(a.publishedAt!))} kl. ${formatTime(new Date(a.publishedAt!))}` : 'kladde'} – kun synlig for dig, mens du er logget ind.{' '}
          <Link href={`/admin/artikler/${a.id}`}>Redigér</Link>
        </p>
      )}
      <JsonLd
        data={articleLd({
          title: a.seoTitle || a.title,
          description: describe(a),
          path: paths.article(a.slug),
          image: a.featuredImage,
          publishedAt: a.publishedAt,
          updatedAt: a.updatedAt,
          author: a.author,
          tags: a.tags,
          section: category,
        })}
      />
      <JsonLd
        data={breadcrumbLd([
          { name: 'Artikler', path: paths.articles() },
          ...(category && a.category ? [{ name: category, path: paths.articleCategory(a.category) }] : []),
          { name: a.title, path: paths.article(a.slug) },
        ])}
      />
      {faqLd && <JsonLd data={faqLd} />}
      <header className="article-hero">
        <span className="article-hero__m" aria-hidden="true">
          M
        </span>
        <div className="article-hero__text">
          <nav className="crumbs article-hero__crumbs" aria-label="Brødkrummer">
            <Link href={paths.articles()}>Artikler</Link>
            {category && a.category && (
              <>
                {' / '}
                <Link href={paths.articleCategory(a.category)}>{category}</Link>
              </>
            )}
          </nav>
          {category && a.category && (
            <Link className="article__cat" href={paths.articleCategory(a.category)}>
              {category}
            </Link>
          )}
          <h1>{a.title}</h1>
          {a.excerpt && <p className="article__lead">{a.excerpt}</p>}
          <p className="article__meta">
            <span className="article__by">
              <span className="article__avatar" aria-hidden="true">
                M.
              </span>
              {a.author === SITE_NAME ? `${SITE_NAME}s redaktion` : a.author}
            </span>
            {published && (
              <time dateTime={a.publishedAt}>
                {formatLong(published)} kl. {formatTime(published)}
              </time>
            )}
            {changedLater && <time dateTime={a.updatedAt}>Opdateret {formatLong(updated)}</time>}
            <span>{readingMinutes(a.content)} min. læsning</span>
          </p>
        </div>
        {a.featuredImage && (
          <figure className="photo-credit-wrap article-hero__figure">
            <img className="article-hero__img" src={a.featuredImage} alt={a.featuredAlt ?? ''} fetchPriority="high" />
            {heroCredit && <figcaption className="photo-credit">{heroCredit}</figcaption>}
          </figure>
        )}
      </header>
      <div className="article-layout">
        <article className="article">
          {played && (
            <p className="article-played" role="status">
              <strong>Kampen er spillet.</strong>{' '}
              {report ? (
                <>
                  Læs referatet: <Link href={paths.article(report.slug)}>{report.title}</Link>
                </>
              ) : (
                'Optakten er skrevet før kampen.'
              )}
            </p>
          )}
          <div className="article-body" dangerouslySetInnerHTML={{ __html: html }} />
          {hasWidget && <Script src="/widget.js" strategy="afterInteractive" />}
          <ShareRow url={url} title={a.title} />
          {a.tags.length > 0 && (
            <ul className="article-tags" aria-label="Emner">
              {a.tags.map((t) => (
                <li key={t}>
                  <Link href={paths.articleTag(slugify(t))}>{t}</Link>
                </li>
              ))}
            </ul>
          )}
          <AdSlot placement="content" />
        </article>
        <ArticleSide subject={subject} now={now} />
      </div>
      {more.length > 0 && (
        <section className="article-more">
          <h2 className="panel__title">Flere artikler</h2>
          <ArticleCards articles={more} categoryNames={new Map()} lead={false} />
        </section>
      )}
    </div>
  )
}
