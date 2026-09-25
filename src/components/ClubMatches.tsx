'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { clubMatches } from '../data/matches'
import { getRealData } from '../data/real'
import { competitionLabel } from '../data/leagues'
import { useNow } from '../hooks/useNow'
import { OUTCOME_LABEL, outcomeFor } from '../lib/result'
import { paths } from '../lib/site'
import { addDays, formatMonth, formatNumeric, formatTime, isoDate } from '../lib/time'
import type { Match } from '../types'
import { Flag } from './Flag'
import { TeamBadge } from './TeamBadge'

const PAGE = 8
type Tab = 'finished' | 'upcoming'

/** Club fixtures and results, as a paged list or a month calendar */
export function ClubMatches({ clubName, initialNow }: { clubName: string; initialNow: number }) {
  const now = useNow(30_000, initialNow)
  const dataVersion = getRealData()?.version
  const all = useMemo(() => clubMatches(clubName, now), [clubName, now, dataVersion]) // eslint-disable-line react-hooks/exhaustive-deps
  const competitions = useMemo(() => [...new Set(all.map((m) => m.league))], [all])
  const [competition, setCompetition] = useState('all')
  const [view, setView] = useState<'list' | 'calendar'>('list')
  const [tab, setTab] = useState<Tab>('finished')
  const [page, setPage] = useState(0)
  const [month, setMonth] = useState(() => isoDate(initialNow).slice(0, 7))

  const matches = competition === 'all' ? all : all.filter((m) => m.league === competition)
  const finished = matches.filter((m) => m.state === 'finished').reverse()
  const upcoming = matches.filter((m) => m.state !== 'finished')
  const list = tab === 'finished' ? finished : upcoming
  const pages = Math.max(1, Math.ceil(list.length / PAGE))
  const shown = list.slice(page * PAGE, page * PAGE + PAGE)
  // For results "back" is older; for fixtures "forward" is later
  const canBack = tab === 'finished' ? page < pages - 1 : page > 0
  const canForward = tab === 'finished' ? page > 0 : page < pages - 1
  const back = () => setPage((p) => (tab === 'finished' ? p + 1 : p - 1))
  const forward = () => setPage((p) => (tab === 'finished' ? p - 1 : p + 1))

  // Group consecutive matches of the same competition
  const groups: { league: string; country?: string; matches: Match[] }[] = []
  for (const m of shown) {
    const last = groups.at(-1)
    if (last && last.league === m.league) last.matches.push(m)
    else groups.push({ league: m.league, country: m.country, matches: [m] })
  }

  return (
    <section className="panel club-matches" aria-labelledby="club-matches-title">
      <header className="club-matches__head">
        <h2 id="club-matches-title" className="panel__title">
          Kampe
        </h2>
        <label className="select">
          <span className="visually-hidden">Turnering</span>
          <select
            id="club-matches-competition"
            value={competition}
            onChange={(e) => {
              setCompetition(e.target.value)
              setPage(0)
            }}
          >
            <option value="all">Alle</option>
            {competitions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </header>

      <div className="segmented" role="tablist" aria-label="Visning">
        {(['list', 'calendar'] as const).map((v) => (
          <button key={v} role="tab" aria-selected={view === v} className={view === v ? 'is-active' : ''} onClick={() => setView(v)}>
            {v === 'list' ? 'Liste' : 'Kalender'}
          </button>
        ))}
      </div>

      {view === 'list' ? (
        <>
          <div className="club-matches__bar">
            {(['finished', 'upcoming'] as const).map((t) => (
              <button
                key={t}
                className={`pill${tab === t ? ' is-active' : ''}`}
                aria-pressed={tab === t}
                onClick={() => {
                  setTab(t)
                  setPage(0)
                }}
              >
                {t === 'finished' ? 'Sluttede' : 'Kommende'}
              </button>
            ))}
            <span className="club-matches__pager">
              <button className="pager-btn" onClick={back} disabled={!canBack} aria-label={tab === 'finished' ? 'Ældre kampe' : 'Forrige'}>
                ‹
              </button>
              <button className="pager-btn" onClick={forward} disabled={!canForward} aria-label={tab === 'finished' ? 'Nyere kampe' : 'Senere kampe'}>
                ›
              </button>
            </span>
          </div>

          {groups.length === 0 ? (
            <p className="muted small pad">{tab === 'finished' ? 'Ingen spillede kampe endnu.' : 'Ingen kommende kampe.'}</p>
          ) : (
            groups.map((g, gi) => (
              <div key={`${g.league}-${gi}`} className="cm-group">
                <div className="cm-group__head">
                  <TeamBadge link={false} name={g.league} size={32} label={competitionLabel(g.league)} />
                  <span>
                    <strong>{g.league}</strong>
                    <span className="cm-group__country">
                      <Flag country={g.country} /> {g.country}
                    </span>
                  </span>
                </div>
                <ul className="cm-list">
                  {g.matches.map((m) => (
                    <ClubMatchRow key={m.id} match={m} clubName={clubName} />
                  ))}
                </ul>
              </div>
            ))
          )}
        </>
      ) : (
        <Calendar matches={matches} clubName={clubName} month={month} onMonth={setMonth} />
      )}
    </section>
  )
}

function ClubMatchRow({ match, clubName }: { match: Match; clubName: string }) {
  const outcome = outcomeFor(match, clubName)
  const showScore = match.state !== 'upcoming'
  const side = (i: 0 | 1) => {
    const team = i === 0 ? match.home : match.away
    const won = match.winner === (i === 0 ? 'home' : 'away')
    return (
      <span className={`cm-team${match.state === 'finished' && !won ? ' is-muted' : ''}`}>
        <TeamBadge name={team.name} src={team.badge} colors={team.colors} size={22} />
        <span className="cm-team__name">{team.name}</span>
      </span>
    )
  }
  return (
    <li className={`cm-row cm-row--${match.state}`}>
      <Link className="stretched-link" href={paths.match(match.slug)} aria-label={`${match.home.name} – ${match.away.name}`} />
      <span className="cm-row__when">
        <time dateTime={match.kickoff.toISOString()}>{formatNumeric(match.kickoff)}</time>
        <span className={match.state === 'live' ? 'is-live' : ''}>
          {match.state === 'upcoming' ? formatTime(match.kickoff) : match.statusLabel === 'Slut' ? 'Slut' : match.statusLabel}
        </span>
      </span>
      <span className="cm-row__teams">
        {side(0)}
        {side(1)}
      </span>
      <span className="cm-row__score">
        {showScore ? (
          <>
            <span className={match.winner === 'home' ? 'is-win' : ''}>{match.home.score}</span>
            <span className={match.winner === 'away' ? 'is-win' : ''}>{match.away.score}</span>
          </>
        ) : null}
      </span>
      {outcome ? (
        <span className={`outcome outcome--${outcome}`} title={OUTCOME_LABEL[outcome]}>
          {outcome}
        </span>
      ) : (
        <span />
      )}
    </li>
  )
}

const WEEKDAYS = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn']

function Calendar({
  matches,
  clubName,
  month,
  onMonth,
}: {
  matches: Match[]
  clubName: string
  month: string
  onMonth: (m: string) => void
}) {
  const byDate = new Map(matches.map((m) => [isoDate(m.kickoff), m]))
  const first = `${month}-01`
  // Monday-based offset of the 1st
  const offset = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7
  const daysInMonth = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).getUTCDate()
  const cells: (string | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => addDays(first, i)),
  ]
  const shift = (n: number) => {
    const d = new Date(`${first}T12:00:00Z`)
    d.setUTCMonth(d.getUTCMonth() + n)
    onMonth(d.toISOString().slice(0, 7))
  }
  const months = matches.map((m) => isoDate(m.kickoff).slice(0, 7))
  const minMonth = months[0] ?? month
  const maxMonth = months.at(-1) ?? month

  return (
    <div className="calendar">
      <div className="calendar__nav">
        <button className="pager-btn" onClick={() => shift(-1)} disabled={month <= minMonth} aria-label="Forrige måned">
          ‹
        </button>
        <strong className="calendar__month">{formatMonth(first)}</strong>
        <button className="pager-btn" onClick={() => shift(1)} disabled={month >= maxMonth} aria-label="Næste måned">
          ›
        </button>
      </div>
      <div className="calendar__grid">
        {WEEKDAYS.map((d) => (
          <span key={d} className="calendar__weekday">
            {d}
          </span>
        ))}
        {cells.map((date, i) => {
          if (!date) return <span key={`e${i}`} />
          const m = byDate.get(date)
          const day = Number(date.slice(8))
          if (!m) {
            return (
              <span key={date} className="calendar__day">
                {day}
              </span>
            )
          }
          const opponent = m.home.name === clubName ? m.away : m.home
          const outcome = outcomeFor(m, clubName)
          return (
            <Link
              key={date}
              href={paths.match(m.slug)}
              className={`calendar__day has-match${outcome ? ` outcome-bg--${outcome}` : ''}`}
              title={`${m.home.name} – ${m.away.name}${m.state === 'upcoming' ? ` kl. ${formatTime(m.kickoff)}` : ` ${m.home.score}-${m.away.score}`}`}
            >
              <span className="calendar__num">{day}</span>
              <TeamBadge link={false} name={opponent.name} colors={opponent.colors} size={24} />
              <span className="calendar__meta">{m.state === 'upcoming' ? formatTime(m.kickoff) : `${m.home.score}-${m.away.score}`}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
