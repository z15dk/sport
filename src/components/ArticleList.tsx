import Link from 'next/link'
import type { Article } from '../lib/articles'
import { paths } from '../lib/site'
import { formatLong } from '../lib/time'
import { photoCredits } from '../lib/photos/server'

/** Article cards: featured image, category, title, excerpt and date */
export function ArticleCards({ articles, categoryNames, lead = true }: { articles: Article[]; categoryNames: Map<string, string>; lead?: boolean }) {
  // The photographer in the corner of each picture from the photo archive
  const credits = photoCredits(articles.map((a) => a.featuredImage))
  return (
    <ul className="article-cards">
      {articles.map((a, i) => (
        <li key={a.id} className={lead && i === 0 ? 'article-card article-card--lead' : 'article-card'}>
          <Link href={paths.article(a.slug)}>
            {a.featuredImage ? (
              <span className="photo-credit-wrap article-card__media">
                <img className="article-card__img" src={a.featuredImage} alt={a.featuredAlt ?? ''} loading={i < 2 ? 'eager' : 'lazy'} />
                {credits.get(a.featuredImage) && <span className="photo-credit">{credits.get(a.featuredImage)}</span>}
              </span>
            ) : (
              <span className="article-card__img article-card__img--none" aria-hidden="true">
                M.
              </span>
            )}
            <span className="article-card__text">
              {a.category && <span className="article-card__cat">{categoryNames.get(a.category) ?? a.category}</span>}
              <strong className="article-card__title">{a.title}</strong>
              {a.excerpt && <span className="article-card__excerpt">{a.excerpt}</span>}
              <span className="article-card__date">{a.publishedAt ? formatLong(new Date(a.publishedAt)) : ''}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** Page links for a list of articles */
export function Pager({ page, pages, href }: { page: number; pages: number; href: (p: number) => string }) {
  if (pages <= 1) return null
  return (
    <nav className="pager" aria-label="Sider">
      {page > 1 && (
        <Link className="pill" href={href(page - 1)} rel="prev">
          ← Nyere
        </Link>
      )}
      <span className="muted small">
        Side {page} af {pages}
      </span>
      {page < pages && (
        <Link className="pill" href={href(page + 1)} rel="next">
          Ældre →
        </Link>
      )}
    </nav>
  )
}
