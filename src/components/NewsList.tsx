import type { Club, Division } from '../data/leagues'
import type { Article } from '../lib/news'
import { formatNumeric, formatTime, isoDate } from '../lib/time'
import { TeamBadge } from './TeamBadge'

/** The site an article is on: "dr.dk", "indkast.dk" */
function siteOf(link: string) {
  try {
    return new URL(link).hostname.replace(/^www\./, '')
  } catch {
    return undefined
  }
}

/** When an article came out: "14:32" today, "i går 14:32", else the date */
function when(date: number, now: number) {
  const d = new Date(date)
  const day = isoDate(d)
  if (day === isoDate(now)) return `i dag ${formatTime(d)}`
  if (day === isoDate(now - 86_400_000)) return `i går ${formatTime(d)}`
  return formatNumeric(d)
}

/**
 * "Seneste nyheder": headlines from the RSS feeds (src/lib/news.ts) about a
 * club or a league, each with the club's logo, the source and the time. A click
 * opens the article on the source's own site in a new tab.
 */
export function NewsList({
  articles,
  division,
  club,
  team,
  badges,
  fallback,
}: {
  articles: Article[]
  division?: Division
  club?: Club
  /** A team outside our leagues (a women's team): its own logo on every article */
  team?: { name: string; logo?: string; colors?: [string, string] }
  /** The badge for each article, by article key (feed|id), before the others */
  badges?: Record<string, { name: string; logo?: string; colors?: [string, string] }>
  /** The badge when nothing else fits (a tournament's logo) */
  fallback?: { name: string; logo?: string; label?: string }
}) {
  if (!articles.length) return null
  const now = Date.now()
  const byId = new Map(division?.clubs.map((c) => [c.id, c]))
  return (
    <section className="panel news">
      <h2 className="panel__title">Seneste nyheder</h2>
      <ul className="news__list">
        {articles.map((a) => {
          const who = club ?? a.clubs.map((id) => byId.get(id)).find(Boolean)
          const own = badges?.[`${a.feed}|${a.id}`] ?? team
          return (
            <li key={`${a.feed}|${a.id}`}>
              <a className="news__item" href={a.link} target="_blank" rel="noopener noreferrer">
                {own ? (
                  <TeamBadge link={false} name={own.name} src={own.logo} colors={own.colors} size={32} />
                ) : who ? (
                  <TeamBadge link={false} name={who.name} colors={who.colors} size={32} />
                ) : (
                  (division || fallback) && (
                    <TeamBadge
                      link={false}
                      name={division?.name ?? fallback!.name}
                      src={fallback?.logo}
                      label={division?.short ?? fallback?.label}
                      colors={['#0f110c', '#c6f135']}
                      size={32}
                    />
                  )
                )}
                <span className="news__text">
                  <strong className="news__title">{a.title}</strong>
                  <span className="news__meta">
                    Nyhed fra {siteOf(a.link) ?? a.source} · {when(a.date, now)} <span aria-hidden="true">↗</span>
                  </span>
                </span>
              </a>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
