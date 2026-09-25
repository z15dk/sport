import Link from 'next/link'
import { formatDayMonth, formatTime, isoDate } from '../lib/time'
import { paths } from '../lib/site'
import type { Match, Team } from '../types'
import { TeamBadge } from './TeamBadge'
import { MatchChannel, MatchOdds } from './MatchExtras'
import { oddsFor } from '../data/odds'

function lost(team: Team, other: Team) {
  return team.score !== undefined && other.score !== undefined && team.score < other.score
}

export function MatchRow({ match, showDate }: { match: Match; showDate?: boolean }) {
  const { home, away, state } = match
  const finished = state === 'finished'
  const showScore = state === 'live' || finished

  const odds = oddsFor(match)

  return (
    <li className={`match match--${state}`}>
      {/* Covers the whole row; the club badges sit on top and link to the clubs */}
      <Link className="stretched-link" href={paths.match(match.slug)} aria-label={`${home.name} – ${away.name}`} />
      <div className="match__when">
        <time className="match__time" dateTime={match.kickoff.toISOString()}>
          {showDate && <span className="match__date">{formatDayMonth(isoDate(match.kickoff))}</span>}
          {formatTime(match.kickoff)}
        </time>
        {state !== 'finished' && state !== 'postponed' && <MatchChannel match={match} />}
      </div>
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
      <div className="match__right">
        {odds ? (
          <MatchOdds odds={odds} />
        ) : (
          <>
            <div className="match__scores" aria-label={showScore ? `${home.score ?? 0} – ${away.score ?? 0}` : undefined}>
              <span className={finished && lost(home, away) ? 'is-lost' : ''}>{showScore ? (home.score ?? '–') : '–'}</span>
              <span className={finished && lost(away, home) ? 'is-lost' : ''}>{showScore ? (away.score ?? '–') : '–'}</span>
            </div>
            {match.statusLabel ? <span className={`status status--${state}`}>{match.statusLabel}</span> : <span />}
          </>
        )}
      </div>
    </li>
  )
}
