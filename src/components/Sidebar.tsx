import type { LeagueGroup } from '../types'
import { TeamBadge } from './TeamBadge'

interface Props {
  groups: LeagueGroup[]
  pinned: Set<string>
}

export function Sidebar({ groups, pinned }: Props) {
  const favorites = groups.filter((g) => pinned.has(g.leagueId))
  const others = groups.filter((g) => !pinned.has(g.leagueId))

  const list = (items: LeagueGroup[]) => (
    <ul className="side-list">
      {items.map((g) => (
        <li key={g.leagueId}>
          <a href={`#league-${g.leagueId}`}>
            <TeamBadge name={g.league} src={g.leagueBadge} size={18} />
            <span className="side-list__name">{g.league}</span>
            <span className="side-list__count">{g.matches.length}</span>
          </a>
        </li>
      ))}
    </ul>
  )

  return (
    <aside className="sidebar card" aria-label="Turneringer">
      {favorites.length > 0 && (
        <>
          <h2 className="card__title">Favoritter</h2>
          {list(favorites)}
        </>
      )}
      <h2 className="card__title">Turneringer i dag</h2>
      {others.length > 0 ? list(others) : <p className="muted small">Ingen turneringer</p>}
    </aside>
  )
}
