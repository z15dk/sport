import Link from 'next/link'
import { formatDayMonth, formatTime, isoDate } from '../lib/time'
import { paths } from '../lib/site'
import type { Incident, Match, Team } from '../types'
import { TeamBadge } from './TeamBadge'
import { SportIcon } from './SportIcon'
import { MatchChannel, MatchOdds } from './MatchExtras'
import { oddsFor } from '../data/odds'

function lost(team: Team, other: Team) {
  return team.score !== undefined && other.score !== undefined && team.score < other.score
}

/** Goals and red cards for one side, e.g. "⚽ 23' 67' 🟥 55'" */
function TeamEvents({ incidents, side }: { incidents?: Incident[]; side: Incident['side'] }) {
  // An own goal counts for the other side
  const goals = (incidents ?? []).filter((i) => (i.kind === 'own-goal' ? i.side !== side : i.side === side) && i.kind !== 'yellow' && i.kind !== 'red')
  const reds = (incidents ?? []).filter((i) => i.side === side && i.kind === 'red')
  if (!goals.length && !reds.length) return null
  const minute = (i: Incident) => `${i.minute}'${i.kind === 'penalty' ? ' (str.)' : i.kind === 'own-goal' ? ' (selvm.)' : ''}`
  return (
    <span className="team__events">
      {goals.length > 0 && (
        <span title={goals.map((g) => `${minute(g)} ${g.player ?? ''}`.trim()).join(', ')}>
          <span aria-hidden>⚽</span> {goals.map(minute).join(' ')}
        </span>
      )}
      {reds.length > 0 && (
        <span className="team__red" title={reds.map((r) => `${r.minute}' ${r.player ?? ''}`.trim()).join(', ')}>
          <span className="red-card" aria-label="Rødt kort" /> {reds.map((r) => `${r.minute}'`).join(' ')}
        </span>
      )}
    </span>
  )
}

export function MatchRow({ match, showDate, showLeague, showSport }: { match: Match; showDate?: boolean; showLeague?: boolean; showSport?: boolean }) {
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
        {state !== 'finished' && state !== 'postponed' && <MatchChannel match={match} only="name" />}
        {state !== 'finished' && state !== 'postponed' && <MatchChannel match={match} only="logo" small />}
      </div>
      <div className="match__teams">
        {showLeague && (
          <span className="match__league">
            {showSport && <SportIcon sport={match.sport} size={11} />}
            {match.league}
          </span>
        )}
        {[home, away].map((team, i) => {
          const other = i === 0 ? away : home
          return (
            <div key={i} className={`team${finished && lost(team, other) ? ' team--lost' : ''}`}>
              <TeamBadge name={team.name} src={team.badge} colors={team.colors} />
              <span className="team__name">{team.name}</span>
              {showScore && <TeamEvents incidents={match.incidents} side={i === 0 ? 'home' : 'away'} />}
            </div>
          )
        })}
      </div>
      <div className="match__right">
        {/* Fixed slots, so channel logos and odds line up down the list whatever the sport */}
        <span className="match__slot">
          {state !== 'finished' && state !== 'postponed' && <MatchChannel match={match} only="logo" />}
        </span>
        <span className={odds ? 'match__result' : 'match__result match__result--score'}>
          {odds ? (
            <MatchOdds odds={odds} />
          ) : (
            <>
              <span className="match__scores" aria-label={showScore ? `${home.score ?? 0} – ${away.score ?? 0}` : undefined}>
                <span className={finished && lost(home, away) ? 'is-lost' : ''}>{showScore ? (home.score ?? '–') : '–'}</span>
                <span className={finished && lost(away, home) ? 'is-lost' : ''}>{showScore ? (away.score ?? '–') : '–'}</span>
              </span>
              {match.statusLabel ? <span className={`status status--${state}`}>{match.statusLabel}</span> : <span />}
            </>
          )}
        </span>
      </div>
    </li>
  )
}
