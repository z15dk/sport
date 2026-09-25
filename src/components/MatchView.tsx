'use client'

import Link from 'next/link'
import { formatShortYear, formatTime } from '../lib/time'
import { paths } from '../lib/site'
import { clubStats, findClub, scoreWords, type ClubStats, type PastMatch } from '../data/matchInsights'
import { clubSeasonStats } from '../data/stats'
import { sportOf } from '../data/leagues'
import { findMatch } from '../data/matches'
import { teamByName } from '../data/teams'
import { useNow } from '../hooks/useNow'
import type { Match } from '../types'
import { StatBar } from './StatBar'
import { FormChips } from './FormChips'
import { summary } from '../lib/matchText'
import { Updated } from './Updated'
import { MatchExtrasPanel } from './MatchExtras'
import { TeamBadge } from './TeamBadge'

/** Where the head-to-head meetings come from */
export type H2hSource = 'database' | 'api-sports' | 'both'

interface Props {
  slug: string
  date: string
  initialNow: number
  /** Real meetings from the match database, when both clubs are in it */
  realH2h?: PastMatch[]
  h2hSource?: H2hSource
}

/** Match page body. Regenerates the match as time passes so live scores tick. */
export function MatchView({ slug, date, initialNow, realH2h, h2hSource }: Props) {
  const now = useNow(30_000, initialNow)
  const match = findMatch(slug, date, now)
  if (!match) return null
  return <MatchBody match={match} now={now} realH2h={realH2h} h2hSource={h2hSource} />
}

const one = (n: number) => n.toLocaleString('da-DK', { maximumFractionDigits: 1, minimumFractionDigits: 1 })

/** Both clubs' season side by side: the home side at home, the away side away, and their goal habits */
function seasonCompare(match: Match) {
  const h = findClub(match.home.name)
  const a = findClub(match.away.name)
  if (!h || !a || match.sport !== 'soccer') return undefined
  const hs = clubSeasonStats(h.club, h.division)
  const as = clubSeasonStats(a.club, a.division)
  if (!hs || !as) return undefined
  const ppg = (points: number, played: number) => (played ? points / played : 0)
  const homePpg = ppg(hs.home.points, hs.home.played)
  const awayPpg = ppg(as.away.points, as.away.played)
  const rows = [
    { label: 'Point pr. kamp (hjemme / ude)', home: homePpg, away: awayPpg, homeText: one(homePpg), awayText: one(awayPpg) },
    { label: 'Mål pr. kamp', home: hs.goalsForPerMatch, away: as.goalsForPerMatch, homeText: one(hs.goalsForPerMatch), awayText: one(as.goalsForPerMatch) },
    {
      label: 'Mål imod pr. kamp',
      home: hs.goalsAgainstPerMatch,
      away: as.goalsAgainstPerMatch,
      homeText: one(hs.goalsAgainstPerMatch),
      awayText: one(as.goalsAgainstPerMatch),
      lowerIsBetter: true,
    },
    { label: 'Clean sheets', home: hs.cleanSheets, away: as.cleanSheets, homeText: `${hs.cleanSheets}`, awayText: `${as.cleanSheets}` },
    { label: 'Begge hold scorer', home: hs.bttsPct, away: as.bttsPct, homeText: `${hs.bttsPct} %`, awayText: `${as.bttsPct} %` },
    { label: 'Over 2,5 mål', home: hs.over25Pct, away: as.over25Pct, homeText: `${hs.over25Pct} %`, awayText: `${as.over25Pct} %` },
  ]
  return rows.map((r) => ({ lowerIsBetter: false, ...r }))
}

function ClubName({ name }: { name: string }) {
  const team = teamByName(name)
  return team ? <Link href={paths.club(team.slug)}>{name}</Link> : <>{name}</>
}

function MatchBody({
  match,
  now,
  realH2h,
  h2hSource,
}: {
  match: Match
  now: number
  realH2h?: PastMatch[]
  h2hSource?: H2hSource
}) {
  const { home, away, state } = match
  const showScore = state === 'live' || state === 'finished'
  const homeStats = clubStats(home.name, now)
  const awayStats = clubStats(away.name, now)
  const h2h = realH2h ?? []
  const wins = { home: 0, draw: 0, away: 0 }
  for (const m of h2h) {
    const homeGoals = m.home === home.name ? m.homeScore : m.awayScore
    const awayGoals = m.home === home.name ? m.awayScore : m.homeScore
    if (homeGoals > awayGoals) wins.home++
    else if (homeGoals < awayGoals) wins.away++
    else wins.draw++
  }
  const colorsOf = (name: string) => findClub(name)?.club.colors
  const compare = seasonCompare(match)

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

      <MatchExtrasPanel match={match} />

      <h1 className="match-page__title">
        {home.name} – {away.name}
      </h1>
      <p className="match-page__summary">{summary(match, homeStats, awayStats)}</p>
      <Updated at={now} />

      <div className="match-page__grid">
        {match.incidents && match.incidents.length > 0 && (
          <section className="sheet__section">
            <h2 className="sheet__title">Kampforløb</h2>
            <ol className="timeline">
              {match.incidents.map((e, n) => {
                const label =
                  e.kind === 'goal' ? 'Mål' : e.kind === 'penalty' ? 'Mål (straffespark)' : e.kind === 'own-goal' ? 'Selvmål' : e.kind === 'red' ? 'Rødt kort' : 'Gult kort'
                const icon =
                  e.kind === 'red' ? <span className="red-card" aria-hidden /> : e.kind === 'yellow' ? <span className="yellow-card" aria-hidden /> : <span aria-hidden>⚽</span>
                const body = (
                  <span className={`timeline__event timeline__event--${e.side}`}>
                    {e.side === 'home' ? (
                      <>
                        <span>
                          {e.player ?? label}
                          {e.player && <em> · {label}</em>}
                        </span>
                        {icon}
                      </>
                    ) : (
                      <>
                        {icon}
                        <span>
                          {e.player ?? label}
                          {e.player && <em> · {label}</em>}
                        </span>
                      </>
                    )}
                  </span>
                )
                return (
                  <li key={n} className="timeline__row">
                    {e.side === 'home' ? body : <span />}
                    <span className="timeline__minute">{e.minute}&apos;</span>
                    {e.side === 'away' ? body : <span />}
                  </li>
                )
              })}
            </ol>
          </section>
        )}

        {compare && (
          <section className="sheet__section">
            <h2 className="sheet__title">{state === 'upcoming' ? 'Før kampen' : 'Sæsonen i tal'}</h2>
            {compare.map((c) => (
              <StatBar
                key={c.label}
                label={c.label}
                home={c.home}
                away={c.away}
                homeText={c.homeText}
                awayText={c.awayText}
                lowerIsBetter={c.lowerIsBetter}
              />
            ))}
            <p className="muted small">Beregnet af Scoreline ud fra sæsonens spillede kampe.</p>
          </section>
        )}

        <section className="sheet__section">
          <h2 className="sheet__title">Klubberne i sæsonen</h2>
          {homeStats && awayStats ? (
            <ClubComparison home={homeStats} away={awayStats} />
          ) : (
            <p className="muted small">Sæsonstatistik findes kun for klubber i de ligaer, vi dækker fuldt.</p>
          )}
        </section>

        <section className="sheet__section">
          <h2 className="sheet__title">Seneste indbyrdes opgør</h2>
          <div className="h2h-summary">
            <div>
              <strong>{wins.home}</strong>
              <span>{home.name}</span>
            </div>
            <div>
              <strong>{match.sport === 'soccer' ? wins.draw : h2h.length}</strong>
              <span>{match.sport === 'soccer' ? 'Uafgjort' : 'Kampe'}</span>
            </div>
            <div>
              <strong>{wins.away}</strong>
              <span>{away.name}</span>
            </div>
          </div>
          {h2h.length === 0 && (
            <p className="muted small">
              {realH2h ? 'Klubberne har ikke mødt hinanden i vores data.' : 'Vi har ingen tidligere opgør mellem klubberne.'}
            </p>
          )}
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
          <p className="muted small">
            Kampprogram og resultat: TheSportsDB.{realH2h ? ` Indbyrdes opgør: ${h2hSource === 'api-sports' ? 'API-Sports' : h2hSource === 'both' ? 'vores kampdatabase og API-Sports' : 'vores kampdatabase'}.` : ''}
          </p>
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
  const sport = sportOf(home.division)
  const words = scoreWords(sport)

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
      {sport === 'soccer' && <StatBar label="Uafgjort" home={h.drawn} away={a.drawn} neutral />}
      <StatBar label="Nederlag" home={h.lost} away={a.lost} lowerIsBetter />
      <StatBar label={words.scored} home={h.goalsFor} away={a.goalsFor} />
      <StatBar label={words.conceded} home={h.goalsAgainst} away={a.goalsAgainst} lowerIsBetter />
      <StatBar
        label={words.perGame}
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
