import type { Match } from '../types'
import { ScoreCard } from './ScoreCard'

export function LiveStrip({ matches, onOpen }: { matches: Match[]; onOpen: (m: Match) => void }) {
  const live = matches.filter((m) => m.state === 'live')
  const finished = matches
    .filter((m) => m.state === 'finished')
    .sort((a, b) => b.kickoff.getTime() - a.kickoff.getTime())
    .slice(0, 8)
  const upcoming = matches
    .filter((m) => m.state === 'upcoming')
    .sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime())
    .slice(0, 8)

  const sections = [
    { key: 'live', title: 'Live', items: live, dot: true },
    { key: 'results', title: 'Seneste resultater', items: finished, dot: false },
  ].filter((s) => s.items.length > 0)
  if (sections.length === 0 && upcoming.length > 0) {
    sections.push({ key: 'upcoming', title: 'Kommende kampe', items: upcoming, dot: false })
  }
  if (sections.length === 0) return null

  return (
    <section className="strip" aria-label="Live og seneste resultater">
      <div className="strip__scroller">
        {sections.map((s) => (
          <div key={s.key} className="strip__section">
            <h2 className="strip__title">
              {s.title}
              {s.dot && <span className="live-dot" aria-hidden />}
            </h2>
            <div className="strip__cards">
              {s.items.map((m) => (
                <ScoreCard key={m.id} match={m} onOpen={onOpen} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
