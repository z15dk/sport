import Link from 'next/link'
import type { ReactNode } from 'react'
import { readingMinutes, type Article } from '../lib/articles'
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
              <span className="article-card__date">
                {a.publishedAt ? formatLong(new Date(a.publishedAt)) : ''}
                <span aria-hidden="true"> · </span>
                {readingMinutes(a.content)} min. læsning
              </span>
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

/**
 * The dark Matchly top of the article pages (as the league and match pages): the kicker with the
 * logo, a big title, a line under it, the categories as pills and a few numbers; Matchly's outlined M behind
 */
export function ArticlesHero({
  kicker,
  title,
  lead,
  categories,
  active,
  stats,
  back,
}: {
  kicker: string
  title: string
  lead: ReactNode
  categories: { slug: string; name: string; count: number }[]
  active?: string
  stats: { value: string | number; label: string }[]
  back?: boolean
}) {
  return (
    <header className="ah">
      <span className="ah__m" aria-hidden="true">
        M
      </span>
      <p className="ah__kicker">
        <span className="ah__logo">
          MATCHLY<b>.</b>
        </span>
        <span>{kicker}</span>
        {back && (
          <Link className="ah__back" href={paths.articles()}>
            ← Alle artikler
          </Link>
        )}
      </p>
      <h1 className="ah__title">{title}</h1>
      <p className="ah__lead">{lead}</p>
      {categories.length > 0 && (
        <nav className="ah__cats" aria-label="Kategorier">
          <Link className={`ah__cat${active ? '' : ' is-active'}`} href={paths.articles()} aria-current={active ? undefined : 'page'}>
            Alle
          </Link>
          {categories.map((c) => (
            <Link key={c.slug} className={`ah__cat${active === c.slug ? ' is-active' : ''}`} href={paths.articleCategory(c.slug)} aria-current={active === c.slug ? 'page' : undefined}>
              {c.name} <span>{c.count}</span>
            </Link>
          ))}
        </nav>
      )}
      <dl className="ah__stats">
        {stats.filter((s) => s.value !== 0).map((s) => (
          <div key={s.label}>
            <dt>{s.label}</dt>
            <dd>{s.value}</dd>
          </div>
        ))}
      </dl>
    </header>
  )
}

/** The topics (tags) as chips in a box of their own */
export function ArticleTopics({ tags, active }: { tags: { slug: string; name: string; count: number }[]; active?: string }) {
  if (!tags.length) return null
  return (
    <section className="panel article-topics">
      <h2 className="panel__title">Emner</h2>
      <ul className="article-topics__list">
        {tags.map((t) => (
          <li key={t.slug}>
            <Link className={active === t.slug ? 'is-active' : undefined} href={paths.articleTag(t.slug)}>
              # {t.name} <span>{t.count}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
