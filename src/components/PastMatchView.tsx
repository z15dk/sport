import Link from 'next/link'
import type { Match } from '../types'
import type { PastMatch } from '../data/matchInsights'
import type { PlayerGame } from '../lib/archive'
import { TeamBadge } from './TeamBadge'
import { MatchTimeline } from './MatchTimeline'
import { playerPath } from '../data/player'
import { paths } from '../lib/site'
import { formatLong, formatShortYear, formatTime } from '../lib/time'
import type { Lineup, MatchStats } from '../data/matchExtra'
import { StatBar } from './StatBar'
import { LineupPitch } from './LineupPitch'
import { SubsList } from './SubsList'
import type { Substitution } from '../data/matchExtra'

// The page of an older match (from the match database or the statistics bank):
// the result, goals and cards, the players' ratings, earlier meetings and a
// report written from the data. Rendered on the server only.

interface Props {
  match: Match
  /** The advertising space at the top of the page (AdSlot 'match', rendered on the server) */
  topAd?: React.ReactNode
  season: string
  spectators?: number
  /** Team pages by name (only teams in our register) */
  teamPath: Record<string, string | undefined>
  report?: string[]
  h2h: PastMatch[]
  players: PlayerGame[]
  /** The statistics and line-ups saved when the game was fetched (none for older games) */
  stats?: MatchStats
  lineups?: Lineup[]
  subs?: Substitution[]
}

function TeamName({ name, href }: { name: string; href?: string }) {
  return href ? <Link href={href}>{name}</Link> : <>{name}</>
}

function Side({ team, href }: { team: Match['home']; href?: string }) {
  return (
    <div className="duel__team">
      <TeamBadge link={false} name={team.name} colors={team.colors} size={72} />
      <strong>
        <TeamName name={team.name} href={href} />
      </strong>
    </div>
  )
}

export function PastMatchView({ match, season, spectators, teamPath, report, h2h, players, stats, lineups, subs, topAd }: Props) {
  const { home, away } = match
  const sides = (['home', 'away'] as const).map((side) => ({
    side,
    name: side === 'home' ? home.name : away.name,
    list: players.filter((p) => p.side === side && (p.minutes ?? 0) > 0).slice(0, 11),
  }))
  return (
    <article className="match-page">
      <nav className="crumbs" aria-label="Brødkrummer">
        <Link href="/">Kampe</Link>
        <span aria-hidden>/</span>
        {match.leagueSlug ? <Link href={paths.league(match.leagueSlug)}>{match.league}</Link> : <span>{match.league}</span>}
        <span aria-hidden>/</span>
        <span>
          {home.name} – {away.name}
        </span>
      </nav>
      {topAd}

      <header className="duel">
        <Side team={home} href={teamPath[home.name]} />
        <div className="duel__center">
          <span className="duel__score duel__score--finished">
            {home.score}–{away.score}
          </span>
          <span className="status status--finished">Slut</span>
        </div>
        <Side team={away} href={teamPath[away.name]} />
      </header>

      <MatchTimeline match={match} />

      <h1 className="match-page__title">
        {home.name} – {away.name} {home.score}-{away.score}
      </h1>
      <p className="match-page__summary">
        {match.league} {season} · {formatLong(match.kickoff)} kl. {formatTime(match.kickoff)}
        {spectators ? ` · ${spectators.toLocaleString('da-DK')} tilskuere` : ''}
      </p>

      {report && (
        <section className="story" aria-labelledby="story-title">
          <h2 id="story-title" className="story__title">
            Kampreferat
          </h2>
          {report.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          <p className="muted small">Automatisk skrevet ud fra kampdata.</p>
        </section>
      )}

      <div className="match-page__flow">
        {stats && (
          <section className="sheet__section">
            <h2 className="sheet__title">Kampstatistik</h2>
            {stats.xg && (
              <StatBar
                label={stats.xg.source === 'api-sports' ? 'xG (forventede mål)' : 'Chance-tal (estimat)'}
                home={stats.xg.home}
                away={stats.xg.away}
                homeText={stats.xg.home.toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                awayText={stats.xg.away.toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              />
            )}
            {stats.rows.map((r) => (
              <StatBar key={r.label} {...r} lowerIsBetter={r.label === 'Frispark begået' || r.label === 'Offside'} />
            ))}
          </section>
        )}
        {lineups?.length === 2 && (
          <section className="sheet__section">
            <h2 className="sheet__title">Opstillinger</h2>
            <LineupPitch lineups={[lineups[0], lineups[1]]} />
          </section>
        )}
        {subs && subs.length > 0 && <SubsList subs={subs} home={match.home.name} away={match.away.name} />}
        {sides.some((s) => s.list.length) && (
          <section className="sheet__section">
            <h2 className="sheet__title">Spillerne</h2>
            <div className="absent-cols">
              {sides.map((s) => (
                <div key={s.side}>
                  <h3 className="absent-cols__team">{s.name}</h3>
                  <ul className="past-players">
                    {s.list.map((p) => (
                      <li key={p.playerId}>
                        <Link href={playerPath(p.playerId, p.name)}>{p.name}</Link>
                        <span className="muted small">
                          {[p.goals ? `${p.goals} mål` : '', p.assists ? `${p.assists} assist` : '', p.minutes ? `${p.minutes} min.` : ''].filter(Boolean).join(' · ')}
                        </span>
                        {p.rating !== undefined && <strong className="past-players__rating">{p.rating.toFixed(1).replace('.', ',')}</strong>}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="sheet__section">
          <h2 className="sheet__title">Tidligere opgør</h2>
          {h2h.length === 0 ? (
            <p className="muted small">Vi har ingen tidligere opgør mellem holdene.</p>
          ) : (
            <ul className="h2h">
              {h2h.map((m, i) => {
                const winner = m.homeScore > m.awayScore ? m.home : m.homeScore < m.awayScore ? m.away : null
                return (
                  <li key={i} className="h2h__row">
                    <span className="h2h__meta">
                      {formatShortYear(m.date)}
                      <em>{m.competition}</em>
                    </span>
                    <span className={`h2h__team${winner === m.home ? ' is-winner' : ''}`}>
                      {m.home}
                      <TeamBadge link={false} name={m.home} size={22} />
                    </span>
                    <span className="h2h__score">
                      {m.slug ? <Link href={paths.match(m.slug)} title={`${m.home} – ${m.away} ${m.homeScore}-${m.awayScore}`}>{m.homeScore}–{m.awayScore}</Link> : `${m.homeScore}–${m.awayScore}`}
                    </span>
                    <span className={`h2h__team h2h__team--away${winner === m.away ? ' is-winner' : ''}`}>
                      <TeamBadge link={false} name={m.away} size={22} />
                      {m.away}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </article>
  )
}
