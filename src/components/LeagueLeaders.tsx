import Link from 'next/link'
import type { LeaderRow, Leaders } from '../data/matchExtra'
import { playerPath } from '../data/player'
import { sizedImage } from '../lib/imageSize'
import { seasonClubs } from '../data/season'
import { sportOf } from '../data/leagues'
import { normalize, clubNames } from '../data/aliases'

/** Our club's own name for API-Sports' team name ("FC Copenhagen" -> "FC København") */
function ourName(team: string) {
  const n = normalize(team)
  const found = seasonClubs().filter(
    ({ club, division }) => sportOf(division) === 'soccer' && clubNames(club).some((x) => normalize(x) === n),
  )
  return found.length === 1 ? found[0].club.name : team
}

const LISTS: { key: keyof Leaders; title: string; unit: string }[] = [
  { key: 'scorers', title: 'Topscorere', unit: 'mål' },
  { key: 'assists', title: 'Assists', unit: 'assists' },
  { key: 'yellow', title: 'Gule kort', unit: 'gule' },
  { key: 'red', title: 'Røde kort', unit: 'røde' },
]

function List({ title, unit, rows }: { title: string; unit: string; rows: LeaderRow[] }) {
  return (
    <div className="leaders__list">
      <h3>{title}</h3>
      <ol>
        {rows.map((r, i) => (
          <li key={`${r.name}-${r.team}`}>
            <span className="leaders__rank">{i + 1}</span>
            {r.photo ? <img className="leaders__photo" src={sizedImage(r.photo, 28)} alt="" width={28} height={28} loading="lazy" /> : <span className="leaders__photo" />}
            <span className="leaders__who">
              {r.id ? (
                <Link className="leaders__name" href={playerPath(r.id, r.name)}>
                  <strong>{r.name}</strong>
                </Link>
              ) : (
                <strong>{r.name}</strong>
              )}
              <em>
                {r.teamLogo && <img src={sizedImage(r.teamLogo, 14)} alt="" width={14} height={14} loading="lazy" />} {ourName(r.team)}
                {r.games ? ` · ${r.games} kampe` : ''}
              </em>
            </span>
            <span className="leaders__value" title={`${r.value} ${unit}`}>
              {r.value}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** The league's best players this season: goals, assists, yellow and red cards */
export function LeagueLeaders({ leaders, league }: { leaders: Leaders; league: string }) {
  const lists = LISTS.filter((l) => leaders[l.key].length)
  if (!lists.length) return null
  return (
    <section className="panel leaders" aria-labelledby="leaders-title">
      <header className="table-panel__head">
        <h2 id="leaders-title" className="panel__title">
          Spillerne · {league}
        </h2>
      </header>
      <div className="leaders__grid">
        {lists.map((l) => (
          <List key={l.key} title={l.title} unit={l.unit} rows={leaders[l.key]} />
        ))}
      </div>
    </section>
  )
}
