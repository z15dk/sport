'use client'

import Link from 'next/link'
import { formatShortYear, formatTime } from '../lib/time'
import { paths } from '../lib/site'
import { clubStats, findClub, headToHead, matchStats, type ClubStats } from '../data/matchInsights'
import { findMatch } from '../data/matches'
import { teamByName } from '../data/teams'
import { useNow } from '../hooks/useNow'
import type { Match } from '../types'
import { StatBar } from './StatBar'
import { FormChips } from './FormChips'
import { summary } from '../lib/matchText'
import { Updated } from './Updated'
import { TeamBadge } from './TeamBadge'

interface Props {
  slug: string
  date: string
  initialNow: number
}

/** Match page body. Regenerates the match as time passes so live scores tick. */
export function MatchView({ slug, date, initialNow }: Props) {
  const now = useNow(30_000, initialNow)
  const match = findMatch(slug, date, now)
  if (!match) return null
  return <MatchBody match={match} now={now} />
}

function ClubName({ name }: { name: string }) {
  const team = teamByName(name)
  return team ? <Link href={paths.club(team.slug)}>{name}</Link> : <>{name}</>
}

function MatchBody({ match, now }: { match: Match; now: number }) {
  const { home, away, state } = match
  const showScore = state === 'live' || state === 'finished'
  const stats = matchStats(match)
  const homeStats = clubStats(home.name, now)
  const awayStats = clubStats(away.name, now)
  const h2h = headToHead(home.name, away.name, match.kickoff)
  const wins = { home: 0, draw: 0, away: 0 }
  for (const m of h2h) {
    const homeGoals = m.home === home.name ? m.homeScore : m.awayScore
    const awayGoals = m.home === home.name ? m.awayScore : m.homeScore
    if (homeGoals > awayGoals) wins.home++
    else if (homeGoals < awayGoals) wins.away++
    else wins.draw++
  }
  const colorsOf = (name: string) => findClub(name)?.club.colors

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

      <header className="duel">
        <div className="duel__team">
          <TeamBadge name={home.name} src={home.badge} colors={home.colors} size={72} />
          <strong>
            <ClubName name={home.name} />
          </strong>
          {homeStats && <span className="duel__pos">{homeStats.position}. plads</span>}
        </div>
        <div className="duel__center">
          {showScore ? (
            <span className={`duel__score duel__score--${state}`}>
              {home.score ?? 0}–{away.score ?? 0}
            </span>
          ) : (
            <span className="duel__score">{formatTime(match.kickoff)}</span>
          )}
          <span className={`status status--${state}`}>{match.statusLabel ?? 'Kommende'}</span>
        </div>
        <div className="duel__team">
          <TeamBadge name={away.name} src={away.badge} colors={away.colors} size={72} />
          <strong>
            <ClubName name={away.name} />
          </strong>
          {awayStats && <span className="duel__pos">{awayStats.position}. plads</span>}
        </div>
      </header>

      <h1 className="match-page__title">
        {home.name} – {away.name}
      </h1>
      <p className="match-page__summary">{summary(match, homeStats, awayStats)}</p>
      <Updated at={now} />

      <div className="match-page__grid">
        {stats && (
          <section className="sheet__section">
            <h2 className="sheet__title">Kampstatistik</h2>
            {stats.map((s) => (
              <StatBar
                key={s.label}
                label={s.label}
                home={s.home}
                away={s.away}
                homeText={`${s.home}${s.suffix ?? ''}`}
                awayText={`${s.away}${s.suffix ?? ''}`}
                lowerIsBetter={s.label === 'Gule kort' || s.label === 'Frispark'}
              />
            ))}
          </section>
        )}

        <section className="sheet__section">
          <h2 className="sheet__title">Klubberne i sæsonen</h2>
          {homeStats && awayStats ? (
            <ClubComparison home={homeStats} away={awayStats} />
          ) : (
            <p className="muted small">Sæsonstatistik findes kun for de danske klubber.</p>
          )}
        </section>

        <section className="sheet__section">
          <h2 className="sheet__title">Seneste 5 indbyrdes opgør</h2>
          <div className="h2h-summary">
            <div>
              <strong>{wins.home}</strong>
              <span>{home.name}</span>
            </div>
            <div>
              <strong>{wins.draw}</strong>
              <span>Uafgjort</span>
            </div>
            <div>
              <strong>{wins.away}</strong>
              <span>{away.name}</span>
            </div>
          </div>
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
                    <TeamBadge name={m.home} colors={colorsOf(m.home)} size={22} />
                  </span>
                  <span className="h2h__score">
                    {m.homeScore}–{m.awayScore}
                  </span>
                  <span className={`h2h__team h2h__team--away${winner === m.away ? ' is-winner' : ''}`}>
                    <TeamBadge name={m.away} colors={colorsOf(m.away)} size={22} />
                    {m.away}
                  </span>
                </li>
              )
            })}
          </ul>
          <p className="muted small">Alle resultater er fiktive.</p>
        </section>
      </div>
    </article>
  )
}

function ClubComparison({ home, away }: { home: ClubStats; away: ClubStats }) {
  const h = home.row
  const a = away.row
  const perGame = (goals: number, played: number) => (played ? goals / played : 0)
  const sameDivision = home.division.id === away.division.id

  return (
    <>
      {!sameDivision && (
        <p className="muted small">
          {home.division.name} mod {away.division.name} – tallene er fra hver klubs egen række.
        </p>
      )}
      <StatBar label="Placering" home={home.position} away={away.position} lowerIsBetter />
      <StatBar label="Point" home={h.points} away={a.points} />
      <StatBar label="Sejre" home={h.won} away={a.won} />
      <StatBar label="Uafgjort" home={h.drawn} away={a.drawn} neutral />
      <StatBar label="Nederlag" home={h.lost} away={a.lost} lowerIsBetter />
      <StatBar label="Mål scoret" home={h.goalsFor} away={a.goalsFor} />
      <StatBar label="Mål imod" home={h.goalsAgainst} away={a.goalsAgainst} lowerIsBetter />
      <StatBar
        label="Mål pr. kamp"
        home={perGame(h.goalsFor, h.played)}
        away={perGame(a.goalsFor, a.played)}
        homeText={perGame(h.goalsFor, h.played).toFixed(1).replace('.', ',')}
        awayText={perGame(a.goalsFor, a.played).toFixed(1).replace('.', ',')}
      />
      <div className="form-compare">
        <FormChips form={h.form} />
        <span className="statbar__label">Form</span>
        <FormChips form={a.form} />
      </div>
    </>
  )
}
