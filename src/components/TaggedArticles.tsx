import type { Article } from '../lib/articles'
import { categories } from '../lib/articles'
import { ArticleCards } from './ArticleList'

/** Our own articles tagged with this league or club (on the league and club pages) */
export function TaggedArticles({ articles, title }: { articles: Article[]; title: string }) {
  if (!articles.length) return null
  const names = new Map(categories().map((c) => [c.slug, c.name]))
  return (
    <section className="panel tagged-articles">
      <h2 className="panel__title">{title}</h2>
      <ArticleCards articles={articles} categoryNames={names} lead={false} />
    </section>
  )
}
