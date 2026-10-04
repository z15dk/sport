import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { allTags, categories, publishedArticles } from '../../../../lib/articles'
import { ArticleCards, Pager } from '../../../../components/ArticleList'
import { JsonLd, breadcrumbLd, webPageLd } from '../../../../lib/jsonld'
import { paths } from '../../../../lib/site'
import { feedPath } from '../../../../lib/articleFeed'

export const dynamic = 'force-dynamic'
const PER_PAGE = 12
const KIND = 'tag' as 'kategori' | 'tag'

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
  if (!name) notFound()
  const { articles, total } = publishedArticles({ [KIND === 'kategori' ? 'category' : 'tag']: slug, limit: PER_PAGE, offset: (page - 1) * PER_PAGE })
  const cats = categories()
  return (
    <div className="page">
      <JsonLd data={webPageLd(pathOf(slug, page), name, new Date())} />
      <JsonLd data={breadcrumbLd([{ name: 'Artikler', path: paths.articles() }, { name, path: pathOf(slug) }])} />
      <div className="clubs articles-page">
        <p className="small">
          <Link className="text-btn" href={paths.articles()}>
            ← Alle artikler
          </Link>
        </p>
        <h1 className="feed__title">{KIND === 'kategori' ? name : `# ${name}`}</h1>
        {articles.length ? <ArticleCards articles={articles} categoryNames={new Map(cats.map((c) => [c.slug, c.name]))} /> : <p className="muted">Ingen artikler endnu.</p>}
        <Pager page={page} pages={Math.ceil(total / PER_PAGE)} href={(p) => pathOf(slug, p)} />
      </div>
    </div>
  )
}
