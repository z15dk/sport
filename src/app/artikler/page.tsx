import type { Metadata } from 'next'
import { allTags, categories, publishedArticles } from '../../lib/articles'
import { ArticleCards, ArticlesHero, ArticleTopics, Pager } from '../../components/ArticleList'
import { JsonLd, breadcrumbLd, webPageLd } from '../../lib/jsonld'
import { SITE_NAME, paths } from '../../lib/site'
import { feedPath } from '../../lib/articleFeed'
import { mostRead } from '../../lib/articleStats'

export const dynamic = 'force-dynamic'
/** The top story and twelve cards: four full rows of three */
const PER_PAGE = 13

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
  const cats = categories().map((c) => ({ ...c, count: publishedArticles({ category: c.slug, limit: 0 }).total })).filter((c) => c.count > 0)
  const tags = allTags().slice(0, 24)
  const names = new Map(cats.map((c) => [c.slug, c.name]))
  // The top's three: the most read this week, else the newest after the top story
  const all = publishedArticles().articles
  const read = mostRead(all)
  const picks = (read.length ? read.map((r) => r.article) : all.slice(1, 4)).map((a) => ({
    slug: a.slug,
    title: a.title,
    category: a.category ? names.get(a.category) : undefined,
    image: a.featuredImage,
  }))
  return (
    <div className="page">
      <JsonLd data={webPageLd(paths.articles(page), 'Artikler', new Date())} />
      <JsonLd data={breadcrumbLd([{ name: 'Artikler', path: paths.articles() }])} />
      <div className="clubs articles-page">
        <ArticlesHero
          kicker="Artikler"
          title="Artikler"
          lead={
            <>
              Optakter, nyheder og statistik om dansk og international sport – skrevet ud fra Matchlys egne data. Følg med i din læser via{' '}
              <a href={feedPath()}>RSS-feedet</a>.
            </>
          }
          categories={cats}
          picks={picks}
          picksLabel={read.length ? 'Mest læste lige nu' : 'Nyt på Matchly'}
        />
        {articles.length ? <ArticleCards articles={articles} categoryNames={names} lead={page === 1} /> : <p className="muted">Der er ingen artikler endnu.</p>}
        <Pager page={page} pages={Math.ceil(total / PER_PAGE)} href={paths.articles} />
        <ArticleTopics tags={tags} />
      </div>
    </div>
  )
}
