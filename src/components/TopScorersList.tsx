import type { TopScorer } from '../lib/dbuLineups'
import { TeamBadge } from './TeamBadge'

/** A league's top scorers counted from the match pages (2. and 3. division): logo, name, goals and the move since the last match day */
export function TopScorersList({ league, scorers }: { league: string; scorers: TopScorer[]; goals?: number; matches?: number }) {
  if (!scorers.length) return null
  return (
    <section className="panel leaders topscorers" aria-labelledby="topscorers-title">
      <header className="table-panel__head">
        <h2 id="topscorers-title" className="panel__title">
          Topscorere · {league}
        </h2>
      </header>
      <div className="leaders__grid leaders__grid--one">
        <div className="leaders__list">
          <ol>
            {scorers.map((s) => (
              <li key={`${s.name}|${s.team}`} className="topscorers__row">
                <span className="leaders__rank">{s.rank}</span>
                <span
                  className={`topscorers__move${s.moved === undefined ? ' is-new' : s.moved > 0 ? ' is-up' : s.moved < 0 ? ' is-down' : ''}`}
                  title={s.moved === undefined ? 'Ny på listen' : s.moved > 0 ? `${s.moved} plads${s.moved > 1 ? 'er' : ''} op siden sidste spilledag` : s.moved < 0 ? `${-s.moved} plads${s.moved < -1 ? 'er' : ''} ned siden sidste spilledag` : 'Samme plads som efter sidste spilledag'}
                >
                  {s.moved === undefined || s.moved > 0 ? '▲' : s.moved < 0 ? '▼' : '–'}
                </span>
                <TeamBadge name={s.club ?? s.team} size={28} />
                <span className="leaders__who">
                  <strong>{s.name}</strong>
                  <em>{s.club ?? s.team}</em>
                </span>
                <span className="leaders__value" title={`${s.goals} mål`}>
                  {s.goals}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <p className="muted small topscorers__note">Pil op/ned: flyttet siden sidste spilledag.</p>
    </section>
  )
}
