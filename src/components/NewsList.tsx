import type { Club, Division } from '../data/leagues'
import type { Article } from '../lib/news'
import { formatNumeric, formatTime, isoDate } from '../lib/time'
import { TeamBadge } from './TeamBadge'

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
export function NewsList({ articles, division, club }: { articles: Article[]; division: Division; club?: Club }) {
  if (!articles.length) return null
  const now = Date.now()
  const byId = new Map(division.clubs.map((c) => [c.id, c]))
  return (
    <section className="panel news">
      <h2 className="panel__title">Seneste nyheder</h2>
      <ul className="news__list">
        {articles.map((a) => {
          const who = club ?? a.clubs.map((id) => byId.get(id)).find(Boolean)
          return (
            <li key={`${a.feed}|${a.id}`}>
              <a className="news__item" href={a.link} target="_blank" rel="noopener noreferrer">
                {who ? (
                  <TeamBadge link={false} name={who.name} colors={who.colors} size={32} />
                ) : (
                  <TeamBadge link={false} name={division.name} label={division.short} colors={['#0f110c', '#c6f135']} size={32} />
                )}
                <span className="news__text">
                  <strong className="news__title">{a.title}</strong>
                  <span className="news__meta">
                    {a.source} · {when(a.date, now)} <span aria-hidden="true">↗</span>
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
