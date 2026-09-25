import type { Match } from '../types'
import { ScoreCard } from './ScoreCard'

/** Live matches and latest results of the chosen day, and the next matches over the coming days */
export function LiveStrip({ matches, upcoming, now }: { matches: Match[]; upcoming: Match[]; now: number }) {
  const live = matches.filter((m) => m.state === 'live')
  const finished = matches
    .filter((m) => m.state === 'finished')
    .sort((a, b) => b.kickoff.getTime() - a.kickoff.getTime())
    .slice(0, 8)
  const sections = [
    { key: 'live', title: 'Live', items: live, dot: true },
    { key: 'upcoming', title: 'Kommende kampe', items: upcoming, dot: false },
    { key: 'results', title: 'Seneste resultater', items: finished, dot: false },
  ].filter((s) => s.items.length > 0)
  if (sections.length === 0) return null

  return (
    <section className="strip" aria-label="Live, kommende kampe og seneste resultater">
      <div className="strip__scroller">
        {sections.map((s) => (
          <div key={s.key} className="strip__section">
            <h2 className="strip__title">
              {s.title}
              {s.dot && <span className="live-dot" aria-hidden />}
            </h2>
            <div className="strip__cards">
              {s.items.map((m) => (
                <ScoreCard key={m.id} match={m} now={now} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
