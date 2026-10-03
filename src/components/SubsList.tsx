import type { Substitution } from '../data/matchExtra'

// A match's substitutions, each team in its own column: the minute, who came on (↑) and who went off (↓)

export function SubsList({ subs, home, away }: { subs: Substitution[]; home: string; away: string }) {
  const sides = (['home', 'away'] as const).map((side) => ({ side, name: side === 'home' ? home : away, list: subs.filter((s) => s.side === side) }))
  return (
    <section className="sheet__section">
      <h2 className="sheet__title">Udskiftninger</h2>
      <div className="absent-cols">
        {sides.map((s) => (
          <div key={s.side}>
            <h3 className="absent-cols__team">{s.name}</h3>
            {s.list.length ? (
              <ul className="subs-list">
                {s.list.map((x, i) => (
                  <li key={i}>
                    <span className="subs-list__min">{x.minute}&apos;</span>
                    <span>
                      <span className="subs-list__on" aria-label="ind">
                        ↑
                      </span>{' '}
                      {x.on}
                      <br />
                      <span className="subs-list__off" aria-label="ud">
                        ↓
                      </span>{' '}
                      <span className="muted">{x.off}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small">Ingen udskiftninger</p>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
