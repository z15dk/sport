import Link from 'next/link'
import type { LeagueGroup } from '../types'
import { paths } from '../lib/site'
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
      {items.map((g) => {
        const live = g.matches.some((m) => m.state === 'live')
        return (
          <li key={g.leagueId}>
            <Link href={g.leagueSlug ? paths.league(g.leagueSlug) : `#league-${g.leagueId}`}>
              <TeamBadge name={g.league} src={g.leagueBadge} size={26} />
              <span className="side-list__text">
                <span className="side-list__name">{g.league}</span>
                {g.country && <span className="side-list__country">{g.country}</span>}
              </span>
              {live && <span className="live-dot" aria-label="Live" />}
              <span className="side-list__count">{g.matches.length}</span>
            </Link>
          </li>
        )
      })}
    </ul>
  )

  return (
    <aside className="sidebar" aria-label="Turneringer">
      {favorites.length > 0 && (
        <div className="panel">
          <h2 className="panel__title">Favoritter</h2>
          {list(favorites)}
        </div>
      )}
      <div className="panel">
        <h2 className="panel__title">Turneringer</h2>
        {others.length > 0 ? list(others) : <p className="muted small pad">Ingen turneringer denne dag</p>}
      </div>
    </aside>
  )
}
