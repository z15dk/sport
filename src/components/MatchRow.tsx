import { formatTime } from '../dates'
import type { Match, Team } from '../types'
import { TeamBadge } from './TeamBadge'

function outcome(team: Team, other: Team): 'win' | 'loss' | 'draw' | undefined {
  if (team.score === undefined || other.score === undefined) return undefined
  if (team.score > other.score) return 'win'
  if (team.score < other.score) return 'loss'
  return 'draw'
}

export function MatchRow({ match }: { match: Match }) {
  const { home, away, state } = match
  const finished = state === 'finished'
  const showScore = state === 'live' || finished

  const teamLine = (team: Team, other: Team) => {
    const res = finished ? outcome(team, other) : undefined
    return (
      <div className={`team${res === 'loss' ? ' team--muted' : ''}${res === 'win' ? ' team--winner' : ''}`}>
        <TeamBadge name={team.name} src={team.badge} />
        <span className="team__name">{team.name}</span>
        <span className="team__score">{showScore ? (team.score ?? '–') : ''}</span>
      </div>
    )
  }

  return (
    <li className={`match match--${state}`}>
      <div className="match__time">
        <time dateTime={match.kickoff.toISOString()}>{formatTime(match.kickoff)}</time>
        {match.statusLabel && <span className={`match__status match__status--${state}`}>{match.statusLabel}</span>}
      </div>
      <div className="match__teams">
        {teamLine(home, away)}
        {teamLine(away, home)}
      </div>
    </li>
  )
}
