import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { articleBySlug, categoryName, cleanHtml, plainText, publishedArticles, readingMinutes } from '../../../lib/articles'
import { slugify } from '../../../lib/slug'
import { JsonLd, articleLd, breadcrumbLd } from '../../../lib/jsonld'
import { SITE_NAME, SITE_URL, paths } from '../../../lib/site'
import { formatLong, formatTime } from '../../../lib/time'
import { ArticleCards } from '../../../components/ArticleList'
import { AdSlot } from '../../../components/AdSlot'

export const dynamic = 'force-dynamic'

type Params = Promise<{ slug: string }>

const describe = (a: { metaDescription?: string; excerpt: string; content: string }) => (a.metaDescription || a.excerpt || plainText(a.content).slice(0, 157) + '…').trim()
const absolute = (url?: string) => (url?.startsWith('/') ? `${SITE_URL}${url}` : url)

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const a = articleBySlug((await params).slug)
  if (!a) return { title: 'Artikel' }
  const description = describe(a)
  return {
    title: a.seoTitle || a.title,
    description,
    alternates: { canonical: paths.article(a.slug) },
    keywords: [a.focusKeyword, ...a.tags].filter((x): x is string => !!x),
    openGraph: {
      type: 'article',
      title: a.seoTitle || a.title,
      description,
      url: paths.article(a.slug),
      publishedTime: a.publishedAt,
      modifiedTime: a.updatedAt,
      tags: a.tags,
      ...(a.featuredImage && { images: [{ url: absolute(a.featuredImage)!, alt: a.featuredAlt ?? a.title }] }),
    },
    twitter: { card: a.featuredImage ? 'summary_large_image' : 'summary' },
  }
}

export default async function ArticlePage({ params }: { params: Params }) {
  const a = articleBySlug((await params).slug)
  if (!a) notFound()
  const category = categoryName(a.category)
  const html = cleanHtml(a.content)
  const more = publishedArticles({ limit: 4 }).articles.filter((x) => x.id !== a.id).slice(0, 3)
  const published = a.publishedAt ? new Date(a.publishedAt) : undefined
  const updated = new Date(a.updatedAt)
  const changedLater = published && updated.getTime() - published.getTime() > 3_600_000
  return (
    <div className="page">
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
      <article className="article">
        <nav className="crumbs" aria-label="Brødkrummer">
          <Link href={paths.articles()}>Artikler</Link>
          {category && a.category && (
            <>
              {' / '}
              <Link href={paths.articleCategory(a.category)}>{category}</Link>
            </>
          )}
        </nav>
        <header className="article__head">
          {category && a.category && (
            <Link className="article__cat" href={paths.articleCategory(a.category)}>
              {category}
            </Link>
          )}
          <h1>{a.title}</h1>
          {a.excerpt && <p className="article__lead">{a.excerpt}</p>}
          <p className="article__meta">
            {a.author === SITE_NAME ? `${SITE_NAME}s redaktion` : a.author}
            {published && (
              <>
                {' · '}
                <time dateTime={a.publishedAt}>
                  {formatLong(published)} kl. {formatTime(published)}
                </time>
              </>
            )}
            {changedLater && (
              <>
                {' · Opdateret '}
                <time dateTime={a.updatedAt}>{formatLong(updated)}</time>
              </>
            )}
            {` · ${readingMinutes(a.content)} min. læsning`}
          </p>
        </header>
        {a.featuredImage && <img className="article__hero" src={a.featuredImage} alt={a.featuredAlt ?? ''} fetchPriority="high" />}
        <div className="article-body" dangerouslySetInnerHTML={{ __html: html }} />
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
      {more.length > 0 && (
        <section className="article-more">
          <h2 className="panel__title">Flere artikler</h2>
          <ArticleCards articles={more} categoryNames={new Map()} lead={false} />
        </section>
      )}
    </div>
  )
}
