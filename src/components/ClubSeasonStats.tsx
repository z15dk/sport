import type { Club, Division } from '../data/leagues'
import { sportOf } from '../data/leagues'
import { clubSeasonStats, type Record3 } from '../data/stats'
import { IntervalChart } from './IntervalChart'

const one = (n: number) => n.toLocaleString('da-DK', { maximumFractionDigits: 1, minimumFractionDigits: 1 })
const STREAK = { V: ['sejr', 'sejre'], U: ['uafgjort', 'uafgjorte'], T: ['nederlag', 'nederlag'] } as const

function RecordRow({ label, r }: { label: string; r: Record3 }) {
  return (
    <tr>
      <td>{label}</td>
      <td className="num">{r.played}</td>
      <td className="num">{r.won}</td>
      <td className="num">{r.drawn}</td>
      <td className="num">{r.lost}</td>
      <td className="num">
        {r.goalsFor}-{r.goalsAgainst}
      </td>
      <td className="num">
        <strong>{r.points}</strong>
      </td>
    </tr>
  )
}

/** A club's season in numbers, computed from its real matches */
export function ClubSeasonStats({ club, division }: { club: Club; division: Division }) {
  const s = clubSeasonStats(club, division)
  if (!s) return null
  const soccer = sportOf(division) === 'soccer'
  const tiles: [string, string][] = [
    ['Mål pr. kamp', one(s.goalsForPerMatch)],
    ['Mål imod pr. kamp', one(s.goalsAgainstPerMatch)],
    ...(soccer
      ? ([
          ['Clean sheets', `${s.cleanSheets}`],
          ['Kampe uden mål', `${s.failedToScore}`],
          ['Begge hold scorer', `${s.bttsPct} %`],
          ['Over 2,5 mål', `${s.over25Pct} %`],
        ] as [string, string][])
      : []),
    ...(s.homeAttendance ? ([['Tilskuere hjemme (gns.)', s.homeAttendance.toLocaleString('da-DK')]] as [string, string][]) : []),
  ]
  const streak = s.streak && `${s.streak.length} ${STREAK[s.streak.kind][s.streak.length === 1 ? 0 : 1]} i træk`

  return (
    <section className="panel stats-panel">
      <header className="table-panel__head">
        <h2 className="panel__title">Sæsonstatistik</h2>
        <span className="tag">{s.played} kampe</span>
      </header>
      <div className="stat-grid">
        {tiles.map(([label, value]) => (
          <div key={label} className="stat-grid__item">
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <ul className="stats-facts">
        {streak && <li>Lige nu: {streak}. Længste stime uden nederlag: {s.longestUnbeaten} kampe.</li>}
        {s.halfTime && s.halfTime.leading > 0 && (
          <li>
            Førte ved pausen {s.halfTime.leading} {s.halfTime.leading === 1 ? 'gang' : 'gange'} og vandt {s.halfTime.leadingWon} af dem.
          </li>
        )}
        {s.halfTime && s.halfTime.trailing > 0 && (
          <li>
            Var bagud ved pausen {s.halfTime.trailing} {s.halfTime.trailing === 1 ? 'gang' : 'gange'} og hentede {s.halfTime.trailingPoints} point.
          </li>
        )}
        {(s.yellow > 0 || s.red > 0) && (
          <li>
            Kort: <span className="yellow-card" aria-label="Gule kort" /> {s.yellow} · <span className="red-card" aria-label="Røde kort" />{' '}
            {s.red}
          </li>
        )}
      </ul>
      <div className="stats-columns">
        <div>
          <h3 className="stats-sub">Hjemme og ude</h3>
          <div className="table-wrap">
            <table className="table table--compact">
              <thead>
                <tr>
                  <th />
                  <th className="num">K</th>
                  <th className="num">V</th>
                  <th className="num">U</th>
                  <th className="num">T</th>
                  <th className="num">Mål</th>
                  <th className="num">P</th>
                </tr>
              </thead>
              <tbody>
                <RecordRow label="Hjemme" r={s.home} />
                <RecordRow label="Ude" r={s.away} />
              </tbody>
            </table>
          </div>
        </div>
        {s.byInterval && (
          <div>
            <h3 className="stats-sub">Hvornår scorer og lukker {club.name} ind?</h3>
            <IntervalChart
              series={[
                { label: 'Scoret', values: s.byInterval.scored },
                { label: 'Lukket ind', values: s.byInterval.conceded },
              ]}
              caption={`Mål pr. kvarter i ${s.byInterval.matches} kampe med målminutter.`}
            />
          </div>
        )}
        {s.scorers.length > 0 && (
          <div>
            <h3 className="stats-sub">Klubbens topscorere</h3>
            <ol className="rank-list">
              {s.scorers.map((r) => (
                <li key={r.player}>
                  <span className="rank-list__name">{r.player}</span>
                  <strong>
                    {r.goals}
                    {r.penalties > 0 && <small> ({r.penalties} str.)</small>}
                  </strong>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
      <p className="muted small stats-note">Beregnet af Scoreline ud fra sæsonens spillede kampe i {division.name}.</p>
    </section>
  )
}
