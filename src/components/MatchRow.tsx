import Link from 'next/link'
import { formatDayMonth, formatTime, isoDate } from '../lib/time'
import { paths } from '../lib/site'
import type { Match, Team } from '../types'
import { TeamBadge } from './TeamBadge'

function lost(team: Team, other: Team) {
  return team.score !== undefined && other.score !== undefined && team.score < other.score
}

export function MatchRow({ match, showDate }: { match: Match; showDate?: boolean }) {
  const { home, away, state } = match
  const finished = state === 'finished'
  const showScore = state === 'live' || finished

  return (
    <li>
      <Link className={`match match--${state}`} href={paths.match(match.slug)}>
      <time className="match__time" dateTime={match.kickoff.toISOString()}>
          {showDate && <span className="match__date">{formatDayMonth(isoDate(match.kickoff))}</span>}
          {formatTime(match.kickoff)}
        </time>
      <div className="match__teams">
        {[home, away].map((team, i) => {
          const other = i === 0 ? away : home
          return (
            <div key={i} className={`team${finished && lost(team, other) ? ' team--lost' : ''}`}>
              <TeamBadge name={team.name} src={team.badge} colors={team.colors} />
              <span className="team__name">{team.name}</span>
            </div>
          )
        })}
      </div>
      <div className="match__scores" aria-label={showScore ? `${home.score ?? 0} – ${away.score ?? 0}` : undefined}>
        {showScore ? (
          <>
            <span className={finished && lost(home, away) ? 'is-lost' : ''}>{home.score ?? '–'}</span>
            <span className={finished && lost(away, home) ? 'is-lost' : ''}>{away.score ?? '–'}</span>
          </>
        ) : (
          <>
            <span>–</span>
            <span>–</span>
          </>
        )}
      </div>
      {match.statusLabel ? <span className={`status status--${state}`}>{match.statusLabel}</span> : <span />}
      </Link>
    </li>
  )
}
