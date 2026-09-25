import Link from 'next/link'
import type { Division } from '../data/leagues'
import { sportOf } from '../data/leagues'
import { leagueStats } from '../data/stats'
import { paths } from '../lib/site'
import { formatShortYear } from '../lib/time'
import { IntervalChart } from './IntervalChart'
import { TeamBadge } from './TeamBadge'

const one = (n: number) => n.toLocaleString('da-DK', { maximumFractionDigits: 1, minimumFractionDigits: 1 })

/** Our own statistics for a league's season */
export function LeagueStats({ division }: { division: Division }) {
  const s = leagueStats(division)
  if (!s) return null
  const soccer = sportOf(division) === 'soccer'
  const word = soccer || sportOf(division) === 'ice_hockey' ? 'Mål' : 'Point'
  const tiles: [string, string][] = [
    [`${word} pr. kamp`, one(s.goalsPerMatch)],
    ['Hjemmesejre', `${s.homeWinPct} %`],
    ...(soccer ? ([['Uafgjort', `${s.drawPct} %`]] as [string, string][]) : []),
    ['Udesejre', `${s.awayWinPct} %`],
    ...(soccer
      ? ([
          ['Over 2,5 mål', `${s.over25Pct} %`],
          ['Begge hold scorer', `${s.bttsPct} %`],
        ] as [string, string][])
      : []),
    ...(s.firstHalfPct !== undefined ? ([['Mål i 1. halvleg', `${s.firstHalfPct} %`]] as [string, string][]) : []),
  ]
  const fixtureText = (f: NonNullable<typeof s.biggestWin>) =>
    `${f.home.name} – ${f.away.name} ${f.score[0]}-${f.score[1]} (${formatShortYear(f.kickoff)})`

  return (
    <section className="panel stats-panel" id="statistik">
      <header className="table-panel__head">
        <h2 className="panel__title">Statistik</h2>
        <span className="tag">{s.played} kampe spillet</span>
      </header>
      <div className="stat-grid">
        {tiles.map(([label, value]) => (
          <div key={label} className="stat-grid__item">
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>

      {(s.biggestWin || s.mostGoals) && (
        <ul className="stats-facts">
          {s.biggestWin && (
            <li>
              Største sejr: <Link href={paths.match(s.biggestWin.slug)}>{fixtureText(s.biggestWin)}</Link>
            </li>
          )}
          {s.mostGoals && (
            <li>
              Flest {word.toLowerCase()} i én kamp: <Link href={paths.match(s.mostGoals.slug)}>{fixtureText(s.mostGoals)}</Link>
            </li>
          )}
        </ul>
      )}

      <div className="stats-columns">
        {s.byInterval && (
          <div>
            <h3 className="stats-sub">Hvornår scores der?</h3>
            <IntervalChart
              series={[{ label: 'Mål', values: s.byInterval.goals }]}
              caption={`Mål pr. kvarter i ${s.byInterval.matches} kampe med målminutter.`}
            />
          </div>
        )}
        {s.scorers.length > 0 && (
          <div>
            <h3 className="stats-sub">Topscorere</h3>
            <ol className="rank-list">
              {s.scorers.map((r) => (
                <li key={`${r.club.id}-${r.player}`}>
                  <TeamBadge name={r.club.name} colors={r.club.colors} size={22} />
                  <span className="rank-list__name">
                    {r.player}
                    <em>{r.club.name}</em>
                  </span>
                  <strong>
                    {r.goals}
                    {r.penalties > 0 && <small> ({r.penalties} str.)</small>}
                  </strong>
                </li>
              ))}
            </ol>
          </div>
        )}
        {s.cards.length > 0 && (
          <div>
            <h3 className="stats-sub">Kort (fair play)</h3>
            <ol className="rank-list">
              {s.cards.slice(0, 8).map((r) => (
                <li key={r.club.id}>
                  <TeamBadge name={r.club.name} colors={r.club.colors} size={22} />
                  <span className="rank-list__name">{r.club.name}</span>
                  <strong className="rank-list__cards">
                    <span className="yellow-card" aria-label="Gule kort" /> {r.yellow} <span className="red-card" aria-label="Røde kort" /> {r.red}
                  </strong>
                </li>
              ))}
            </ol>
          </div>
        )}
        {s.attendance.length > 0 && (
          <div>
            <h3 className="stats-sub">Tilskuere (gns. hjemme)</h3>
            <ol className="rank-list">
              {s.attendance.slice(0, 8).map((r) => (
                <li key={r.club.id}>
                  <TeamBadge name={r.club.name} colors={r.club.colors} size={22} />
                  <span className="rank-list__name">{r.club.name}</span>
                  <strong>{r.average.toLocaleString('da-DK')}</strong>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
      <p className="muted small stats-note">Beregnet af Scoreline ud fra sæsonens spillede kampe.</p>
    </section>
  )
}
