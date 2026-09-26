import type { Club, Division } from '../data/leagues'
import { sportOf } from '../data/leagues'
import { clubSeasonStats, type Record3 } from '../data/stats'
import { scoreWords } from '../data/matchInsights'
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
  const words = scoreWords(sportOf(division))
  const unit = words.unit.toLowerCase()
  const n = s.played
  const goalsFor = s.home.goalsFor + s.away.goalsFor
  const goalsAgainst = s.home.goalsAgainst + s.away.goalsAgainst
  const won = s.home.won + s.away.won
  const drawn = s.home.drawn + s.away.drawn
  const points = s.home.points + s.away.points
  const streak = s.streak && `${s.streak.length} ${STREAK[s.streak.kind][s.streak.length === 1 ? 0 : 1]}`
  const date = (d: Date) => d.toLocaleDateString('da-DK', { day: 'numeric', month: 'short', timeZone: 'Europe/Copenhagen' })
  // Cards and penalties only where the source registers them
  const incidents = s.withIncidents > 0
  const perIncidentMatch = (v: number) => one(v / s.withIncidents)

  const groups: { title: string; rows: [string, string | undefined, string?][] }[] = [
    {
      title: 'Angreb',
      rows: [
        [`${words.unit} pr. kamp`, one(s.goalsForPerMatch)],
        [`Kampe uden ${unit}`, soccer ? `${s.failedToScore}` : undefined],
        ['Straffesparksmål', soccer && incidents ? `${s.penaltiesScored}` : undefined],
        ['Mål i 1. / 2. halvleg', soccer && s.halves ? `${s.halves.scoredFirst} / ${s.halves.scoredSecond}` : undefined],
        ['Selvmål af modstanderen', soccer && incidents && s.ownGoalsFor ? `${s.ownGoalsFor}` : undefined],
        ['Største sejr', s.biggestWin && `${s.biggestWin.gf}-${s.biggestWin.ga}`, s.biggestWin && `mod ${s.biggestWin.opponent} · ${date(s.biggestWin.date)}`],
      ],
    },
    {
      title: 'Forsvar',
      rows: [
        ['Rent bur', soccer ? `${s.cleanSheets}` : undefined],
        [`${words.unit} imod pr. kamp`, one(s.goalsAgainstPerMatch)],
        ['Straffesparksmål imod', soccer && incidents ? `${s.penaltiesConceded}` : undefined],
        ['Mål imod i 1. / 2. halvleg', soccer && s.halves ? `${s.halves.concededFirst} / ${s.halves.concededSecond}` : undefined],
        ['Største nederlag', s.worstDefeat && `${s.worstDefeat.gf}-${s.worstDefeat.ga}`, s.worstDefeat && `mod ${s.worstDefeat.opponent} · ${date(s.worstDefeat.date)}`],
      ],
    },
    {
      title: 'Resultater',
      rows: [
        ['Sejrsprocent', `${Math.round((won / n) * 100)} %`],
        ['Point pr. kamp', drawn || soccer ? one(points / n) : undefined],
        ['Hjemme (V-U-T)', `${s.home.won}-${s.home.drawn}-${s.home.lost}`],
        ['Ude (V-U-T)', `${s.away.won}-${s.away.drawn}-${s.away.lost}`],
        ['Stime lige nu', streak],
        ['Længste stime uden nederlag', `${s.longestUnbeaten} kampe`],
      ],
    },
    {
      title: 'Andre',
      rows: [
        ['Begge hold scorer', soccer ? `${s.bttsPct} %` : undefined],
        ['Over 2,5 mål', soccer ? `${s.over25Pct} %` : undefined],
        ['Førte ved pausen', s.halfTime && s.halfTime.leading ? `${s.halfTime.leadingWon} sejre` : undefined, s.halfTime && s.halfTime.leading ? `i ${s.halfTime.leading} kampe` : undefined],
        ['Bagud ved pausen', s.halfTime && s.halfTime.trailing ? `${s.halfTime.trailingPoints} point` : undefined, s.halfTime && s.halfTime.trailing ? `hentet i ${s.halfTime.trailing} kampe` : undefined],
        ['Gule kort pr. kamp', incidents && soccer ? perIncidentMatch(s.yellow) : undefined],
        ['Røde kort', incidents && soccer ? `${s.red}` : undefined],
        ['Tilskuere hjemme (gns.)', s.homeAttendance?.toLocaleString('da-DK')],
      ],
    },
  ]

  return (
    <section className="panel stats-panel">
      <header className="table-panel__head">
        <h2 className="panel__title">Sæsonstatistik</h2>
        <span className="tag">{n} kampe</span>
      </header>
      <div className="summary-tiles">
        {(
          [
            ['Kampe', n],
            [`${words.unit} scoret`, goalsFor],
            [`${words.unit} lukket ind`, goalsAgainst],
            soccer ? ['Rent bur', s.cleanSheets] : ['Point', points],
          ] as [string, number][]
        ).map(([label, value]) => (
          <div key={label} className="summary-tiles__item">
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <div className="summary-groups">
        {groups.map((g) => {
          const rows = g.rows.filter((r): r is [string, string, string?] => r[1] !== undefined)
          if (!rows.length) return null
          return (
            <div key={g.title} className="summary-group">
              <h3 className="stats-sub">{g.title}</h3>
              <dl>
                {rows.map(([label, value, detail]) => (
                  <div key={label}>
                    <dt>
                      {label}
                      {detail && <small>{detail}</small>}
                    </dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )
        })}
      </div>
      {incidents && soccer && s.withIncidents < n && (
        <p className="muted small">Kort og straffespark er talt i de {s.withIncidents} af {n} kampe, hvor vores kilder har registreret dem.</p>
      )}
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
