import type { Metadata } from 'next'
import Link from 'next/link'
import { allTags, categories, publishedArticles } from '../../lib/articles'
import { ArticleCards, Pager } from '../../components/ArticleList'
import { JsonLd, breadcrumbLd, webPageLd } from '../../lib/jsonld'
import { SITE_NAME, paths } from '../../lib/site'
import { feedPath } from '../../lib/articleFeed'

export const dynamic = 'force-dynamic'
const PER_PAGE = 12

type SearchParams = Promise<{ side?: string }>

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const page = Math.max(1, Number((await searchParams).side) || 1)
  return {
    title: page > 1 ? `Artikler – side ${page}` : 'Artikler om fodbold og sport',
    description: `Artikler, analyser og guides om dansk og international fodbold, ishockey og basketball fra ${SITE_NAME}.`,
    alternates: { canonical: paths.articles(page), types: { 'application/rss+xml': feedPath() } },
  }
}

export default async function ArticlesPage({ searchParams }: { searchParams: SearchParams }) {
  const page = Math.max(1, Number((await searchParams).side) || 1)
  const { articles, total } = publishedArticles({ limit: PER_PAGE, offset: (page - 1) * PER_PAGE })
  const cats = categories()
  const tags = allTags().slice(0, 20)
  return (
    <div className="page">
      <JsonLd data={webPageLd(paths.articles(page), 'Artikler', new Date())} />
      <JsonLd data={breadcrumbLd([{ name: 'Artikler', path: paths.articles() }])} />
      <div className="clubs articles-page">
        <h1 className="feed__title">Artikler</h1>
        <p className="muted">
          Følg artiklerne i din læser: <a href={feedPath()}>RSS-feed</a>
        </p>
        {cats.length > 0 && (
          <nav className="article-filter" aria-label="Kategorier">
            {cats.map((c) => (
              <Link key={c.slug} className="pill" href={paths.articleCategory(c.slug)}>
                {c.name}
              </Link>
            ))}
          </nav>
        )}
        {articles.length ? <ArticleCards articles={articles} categoryNames={new Map(cats.map((c) => [c.slug, c.name]))} /> : <p className="muted">Der er ingen artikler endnu.</p>}
        <Pager page={page} pages={Math.ceil(total / PER_PAGE)} href={paths.articles} />
        {tags.length > 0 && (
          <section className="article-tags-cloud">
            <h2 className="panel__title">Emner</h2>
            <ul className="article-tags">
              {tags.map((t) => (
                <li key={t.slug}>
                  <Link href={paths.articleTag(t.slug)}>{t.name}</Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}
