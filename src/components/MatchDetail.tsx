import { useEffect, useRef } from 'react'
import { formatLong, formatTime } from '../dates'
import { clubStats, findClub, headToHead, matchStats, type ClubStats } from '../data/matchInsights'
import type { Match } from '../types'
import { StatBar } from './StatBar'
import { TeamBadge } from './TeamBadge'

const dateFmt = new Intl.DateTimeFormat('da-DK', { day: 'numeric', month: 'short', year: 'numeric' })

interface Props {
  match: Match
  onClose: () => void
}

export function MatchDetail({ match, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [onClose])

  const { home, away, state } = match
  const showScore = state === 'live' || state === 'finished'
  const stats = matchStats(match)
  const homeStats = clubStats(home.name)
  const awayStats = clubStats(away.name)
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
    <div className="sheet" role="dialog" aria-modal="true" aria-label={`${home.name} mod ${away.name}`}>
      <div className="sheet__backdrop" onClick={onClose} />
      <div className="sheet__panel">
        <header className="sheet__top">
          <span className="sheet__league">
            {match.league} · {formatLong(match.kickoff)}
          </span>
          <button ref={closeRef} className="sheet__close" onClick={onClose} aria-label="Luk kampvisning">
            ×
          </button>
        </header>

        <section className="duel">
          <div className="duel__team">
            <TeamBadge name={home.name} src={home.badge} colors={home.colors} size={64} />
            <strong>{home.name}</strong>
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
            <TeamBadge name={away.name} src={away.badge} colors={away.colors} size={64} />
            <strong>{away.name}</strong>
            {awayStats && <span className="duel__pos">{awayStats.position}. plads</span>}
          </div>
        </section>
        {match.venue && <p className="sheet__venue">Spilles i {match.venue}</p>}

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
                    {dateFmt.format(m.date)}
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
    </div>
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
        <span className="form">
          {h.form.slice(-5).map((f, k) => (
            <span key={k} className={`form__chip form__chip--${f}`}>
              {f}
            </span>
          ))}
        </span>
        <span className="statbar__label">Form</span>
        <span className="form">
          {a.form.slice(-5).map((f, k) => (
            <span key={k} className={`form__chip form__chip--${f}`}>
              {f}
            </span>
          ))}
        </span>
      </div>
    </>
  )
}
