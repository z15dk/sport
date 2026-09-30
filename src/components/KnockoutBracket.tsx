import Link from 'next/link'
import type { BracketRound } from '../lib/bracket'
import { paths } from '../lib/site'
import { TeamBadge } from './TeamBadge'

/** A knock-out tournament's rounds side by side: each tie with the aggregate score, the winner through */
export function KnockoutBracket({ rounds }: { rounds: BracketRound[] }) {
  if (!rounds.length) return null
  // Every tie at its place (in tie heights), so a tie sits by the ties its teams came from
  const rows = Math.max(1, ...rounds.flatMap((r) => r.ties.map((t) => t.pos + 1)))
  return (
    <section className="panel bracket" aria-labelledby="bracket-title">
      <header className="table-panel__head">
        <h2 id="bracket-title" className="panel__title">
          Turneringen
        </h2>
      </header>
      <div className="bracket__scroll">
        <div className="bracket__rounds">
          {rounds.map((r) => (
            <div key={r.name} className="bracket__round">
              <h3 className="bracket__name">{r.name}</h3>
              <ol className="bracket__ties" style={{ height: `calc(${rows} * var(--tie-h))` }}>
                {r.ties.map((tie) => {
                  const link = tie.legs.find((l) => l.slug)?.slug
                  const body = tie.teams.map((t, i) => (
                    <span key={t.name} className={`bracket__team${tie.winner === undefined ? '' : tie.winner === i ? ' is-winner' : ' is-out'}`}>
                      <TeamBadge link={false} name={t.name} src={t.logo} size={22} />
                      <span className="bracket__teamname">{t.name}</span>
                      <b>{t.goals ?? ''}</b>
                    </span>
                  ))
                  return (
                    <li key={tie.key} className="bracket__tie" style={{ top: `calc(${tie.pos} * var(--tie-h))` }}>
                      {link ? (
                        <Link href={paths.match(link)} prefetch={false}>
                          {body}
                        </Link>
                      ) : (
                        <div>{body}</div>
                      )}
                      {tie.legs.length > 1 && <span className="bracket__legs">{tie.legs.length} kampe</span>}
                    </li>
                  )
                })}
              </ol>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
