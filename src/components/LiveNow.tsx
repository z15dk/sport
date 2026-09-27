import type { Match } from '../types'
import { MatchRow } from './MatchRow'

/** A league's matches in progress, at the top of its page on phones (hidden on larger screens, where "Dagens kampe" shows them) */
export function LiveNow({ matches }: { matches: Match[] }) {
  const live = matches.filter((m) => m.state === 'live')
  if (!live.length) return null
  return (
    <section className="league league--live-top" aria-label="Live nu">
      <header className="league__header">
        <div className="league__toggle">
          <span className="league__titles">
            <h2 className="league__name">
              <span className="live-dot" aria-hidden /> Live nu
            </h2>
          </span>
        </div>
      </header>
      <ul className="league__matches">
        {live.map((m) => (
          <MatchRow key={m.id} match={m} />
        ))}
      </ul>
    </section>
  )
}
