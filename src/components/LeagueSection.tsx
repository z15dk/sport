import { useState } from 'react'
import type { LeagueGroup } from '../types'
import { MatchRow } from './MatchRow'
import { TeamBadge } from './TeamBadge'

interface Props {
  group: LeagueGroup
  pinned: boolean
  onTogglePin: () => void
}

export function LeagueSection({ group, pinned, onTogglePin }: Props) {
  const [open, setOpen] = useState(true)
  const liveCount = group.matches.filter((m) => m.state === 'live').length

  return (
    <section className="league" id={`league-${group.leagueId}`}>
      <header className="league__header">
        <button className="league__toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <TeamBadge name={group.league} src={group.leagueBadge} size={28} />
          <span className="league__titles">
            {group.country && <span className="league__country">{group.country}</span>}
            <span className="league__name">{group.league}</span>
          </span>
          {liveCount > 0 && <span className="league__live">{liveCount} live</span>}
          <span className="league__count">{group.matches.length} kampe</span>
          <span className={`chevron${open ? ' is-open' : ''}`} aria-hidden>
            ›
          </span>
        </button>
        <button
          className={`star${pinned ? ' is-on' : ''}`}
          onClick={onTogglePin}
          aria-pressed={pinned}
          aria-label={pinned ? `Fjern ${group.league} fra favoritter` : `Føj ${group.league} til favoritter`}
          title={pinned ? 'Fjern fra favoritter' : 'Føj til favoritter'}
        >
          {pinned ? '★' : '☆'}
        </button>
      </header>
      {open && (
        <ul className="league__matches">
          {group.matches.map((m) => (
            <MatchRow key={m.id} match={m} />
          ))}
        </ul>
      )}
    </section>
  )
}
