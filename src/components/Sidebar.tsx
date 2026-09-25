import Link from 'next/link'
import type { LeagueGroup } from '../types'
import { paths } from '../lib/site'
import { TeamBadge } from './TeamBadge'
import { competitionLabel } from '../data/leagues'

interface Props {
  groups: LeagueGroup[]
  pinned: Set<string>
  /** The tournament the match list is filtered to */
  selected?: string
  onSelect: (leagueId: string | undefined) => void
}

/** The day's tournaments; clicking one filters the match list to it, clicking it again shows all */
export function Sidebar({ groups, pinned, selected, onSelect }: Props) {
  const favorites = groups.filter((g) => pinned.has(g.leagueId))
  const others = groups.filter((g) => !pinned.has(g.leagueId))

  const list = (items: LeagueGroup[]) => (
    <ul className="side-list">
      {items.map((g) => {
        const live = g.matches.some((m) => m.state === 'live')
        const active = g.leagueId === selected
        return (
          <li key={g.leagueId} className={active ? 'is-active' : undefined}>
            <button type="button" aria-pressed={active} onClick={() => onSelect(active ? undefined : g.leagueId)}>
              <TeamBadge link={false} name={g.league} src={g.leagueBadge} size={20} label={competitionLabel(g.league)} />
              <span className="side-list__text" title={g.country ? `${g.league} · ${g.country}` : g.league}>
                <span className="side-list__name">{g.league}</span>
                {g.country && <span className="side-list__country">{g.country}</span>}
              </span>
              {live && <span className="live-dot" aria-label="Live" />}
              <span className="side-list__count">{g.matches.length}</span>
            </button>
            {g.leagueSlug && (
              <Link className="side-list__page" href={paths.league(g.leagueSlug)} title={`${g.league}: stilling og statistik`} aria-label={`Gå til ${g.league}`}>
                ›
              </Link>
            )}
          </li>
        )
      })}
    </ul>
  )

  return (
    <aside className="sidebar" aria-label="Turneringer">
      {selected && (
        <button type="button" className="side-reset" onClick={() => onSelect(undefined)}>
          ✕ Vis alle turneringer
        </button>
      )}
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
