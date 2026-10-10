import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { allTags, categories, publishedArticles, isHiddenCategory, type Article } from '../../../../lib/articles'
import { ArticleCards, ArticlesHero, ArticleTopics, Pager } from '../../../../components/ArticleList'
import { JsonLd, breadcrumbLd, webPageLd } from '../../../../lib/jsonld'
import { paths } from '../../../../lib/site'
import { feedPath } from '../../../../lib/articleFeed'
import { mostRead } from '../../../../lib/articleStats'

export const dynamic = 'force-dynamic'
/** The top story and twelve cards: four full rows of three */
const PER_PAGE = 13
const KIND = 'kategori' as 'kategori' | 'tag'

type Params = Promise<{ slug: string }>
type SearchParams = Promise<{ side?: string }>

function nameOf(slug: string) {
  return KIND === 'kategori' ? categories().find((c) => c.slug === slug)?.name : allTags().find((t) => t.slug === slug)?.name
}
const pathOf = (slug: string, page = 1) => (KIND === 'kategori' ? paths.articleCategory(slug) : paths.articleTag(slug)) + (page > 1 ? `?side=${page}` : '')

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const slug = (await params).slug
  const name = nameOf(slug)
  if (!name) return { title: 'Artikler' }
  return {
    title: KIND === 'kategori' ? `${name} – artikler` : `Artikler om ${name}`,
    description: `Alle Matchlys artikler ${KIND === 'kategori' ? 'i kategorien' : 'om'} ${name}.`,
    alternates: { canonical: pathOf(slug), types: { 'application/rss+xml': feedPath() } },
  }
}

export default async function ArticleGroup({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const slug = (await params).slug
  const page = Math.max(1, Number((await searchParams).side) || 1)
  const name = nameOf(slug)
  // James' previews, reports and search articles are not listed here (only on the match, club and league pages)
  if (!name || (KIND === 'kategori' && isHiddenCategory(slug))) notFound()
  const listed = (list: Article[]) => list.filter((x) => !isHiddenCategory(x.category))
  const all = listed(publishedArticles({ [KIND === 'kategori' ? 'category' : 'tag']: slug }).articles)
  const articles = all.slice((page - 1) * PER_PAGE, page * PER_PAGE)
  const total = all.length
  const cats = categories()
    .filter((c) => !isHiddenCategory(c.slug))
    .map((c) => ({ ...c, count: publishedArticles({ category: c.slug, limit: 0 }).total }))
    .filter((c) => c.count > 0)
  const tags = allTags().slice(0, 24)
  const names = new Map(cats.map((c) => [c.slug, c.name]))
  // The top's three: the most read in this group, else its newest after the top story
  const group = all
  const read = mostRead(group)
  const picks = (read.length ? read.map((r) => r.article) : group.slice(1, 4)).map((a) => ({
    slug: a.slug,
    title: a.title,
    category: a.category ? names.get(a.category) : undefined,
    image: a.featuredImage,
  }))
  return (
    <div className="page">
      <JsonLd data={webPageLd(pathOf(slug, page), name, new Date())} />
      <JsonLd data={breadcrumbLd([{ name: 'Artikler', path: paths.articles() }, { name, path: pathOf(slug) }])} />
      <div className="clubs articles-page">
        <ArticlesHero
          back
          kicker={KIND === 'kategori' ? 'Kategori' : 'Emne'}
          title={KIND === 'kategori' ? name : `# ${name}`}
          lead={`${total} ${total === 1 ? 'artikel' : 'artikler'} ${KIND === 'kategori' ? 'i kategorien' : 'om'} ${name} på Matchly – nyeste først.`}
          categories={cats}
          active={KIND === 'kategori' ? slug : undefined}
          picks={picks}
          picksLabel={read.length ? 'Mest læste' : 'Nyeste'}
        />
        {articles.length ? <ArticleCards articles={articles} categoryNames={names} /> : <p className="muted">Ingen artikler endnu.</p>}
        <Pager page={page} pages={Math.ceil(total / PER_PAGE)} href={(p) => pathOf(slug, p)} />
        <ArticleTopics tags={tags} active={KIND === 'tag' ? slug : undefined} />
      </div>
    </div>
  )
}
