'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { channelsFor } from '../data/channels'
import { clubMatches } from '../data/matches'
import { getRealData } from '../data/real'
import { competitionLabel } from '../data/leagues'
import { useNow } from '../hooks/useNow'
import { OUTCOME_LABEL, outcomeFor } from '../lib/result'
import { paths } from '../lib/site'
import { addDays, formatMonth, formatNumeric, formatTime, isoDate } from '../lib/time'
import type { Match } from '../types'
import { Flag } from './Flag'
import { danishCountry } from '../data/countries'
import { TeamBadge } from './TeamBadge'

const PAGE = 8
/** The most rows a list that fills its box (`fill`) adds to a page */
const FILL_MAX = 8
type Tab = 'finished' | 'upcoming'

/** Club fixtures and results, as a paged list or a month calendar */
/**
 * `matches` gives the list for teams outside our leagues (their games and the
 * ones our statistics bank has saved); our clubs' come from the season.
 * `fill`: when the box is made taller than its list (the page's columns end level, see .flow2), the list
 * shows as many more matches as there is room for instead of an empty space under it.
 */
export function ClubMatches({ clubName, initialNow, matches: given, showTv, fill }: { clubName: string; initialNow: number; matches?: Match[]; showTv?: boolean; fill?: boolean }) {
  const now = useNow(30_000, initialNow)
  const dataVersion = getRealData()?.version
  const all = useMemo(() => given ?? clubMatches(clubName, now), [given, clubName, now, dataVersion]) // eslint-disable-line react-hooks/exhaustive-deps
  const competitions = useMemo(() => [...new Set(all.map((m) => m.league))], [all])
  const [competition, setCompetition] = useState('all')
  const [view, setView] = useState<'list' | 'calendar'>('list')
  // The coming matches first; only results when the club has nothing left to play
  const [tab, setTab] = useState<Tab>(() => (all.some((m) => m.state !== 'finished') ? 'upcoming' : 'finished'))
  const [page, setPage] = useState(0)
  const [month, setMonth] = useState(() => isoDate(initialNow).slice(0, 7))
  const box = useRef<HTMLElement>(null)
  const [more, setMore] = useState(0)
  const drawn = useRef(0)
  useEffect(() => {
    drawn.current = more
  }, [more])
  // The room under the list, in rows; rows are only added, so the box never jumps back and forth
  const fit = () => {
    const el = box.current
    const row = el?.querySelector<HTMLElement>('.cm-row')
    const end = el?.lastElementChild
    if (!fill || !el || !row || !end || !row.offsetHeight) return
    const free = el.getBoundingClientRect().bottom - end.getBoundingClientRect().bottom - parseFloat(getComputedStyle(el).paddingBottom || '0')
    const rows = Math.floor(free / row.offsetHeight)
    // From the rows that are drawn now, so two measurements of the same page add the rows once
    const want = Math.min(FILL_MAX, drawn.current + rows)
    if (rows > 0) setMore((m) => Math.max(m, want))
  }
  // When the box changes height, and once more after the rows it added are drawn (the box keeps its height then)
  useEffect(() => {
    const el = box.current
    if (!fill || !el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [fill]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const frame = requestAnimationFrame(fit)
    return () => cancelAnimationFrame(frame)
  }, [more, tab, view]) // eslint-disable-line react-hooks/exhaustive-deps
  const size = PAGE + more

  const matches = competition === 'all' ? all : all.filter((m) => m.league === competition)
  const finished = matches.filter((m) => m.state === 'finished').reverse()
  const upcoming = matches.filter((m) => m.state !== 'finished')
  const list = tab === 'finished' ? finished : upcoming
  const pages = Math.max(1, Math.ceil(list.length / size))
  const shown = list.slice(page * size, page * size + size)
  // For results "back" is older; for fixtures "forward" is later
  const canBack = tab === 'finished' ? page < pages - 1 : page > 0
  const canForward = tab === 'finished' ? page > 0 : page < pages - 1
  const back = () => setPage((p) => (tab === 'finished' ? p + 1 : p - 1))
  const forward = () => setPage((p) => (tab === 'finished' ? p - 1 : p + 1))

  // One group per competition (in the order they first come), so a cup game between league games doesn't split the league
  const groups: { league: string; country?: string; badge?: string; slug?: string; matches: Match[] }[] = []
  for (const m of shown) {
    const group = groups.find((g) => g.league === m.league)
    if (!group) groups.push({ league: m.league, country: m.country, badge: m.leagueBadge, slug: m.leagueSlug, matches: [m] })
    else {
      group.matches.push(m)
      group.badge ??= m.leagueBadge
      group.slug ??= m.leagueSlug
    }
  }

  return (
    <section ref={box} className="panel club-matches kh-target" id="kampe" aria-labelledby="club-matches-title">
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
            {(['upcoming', 'finished'] as const).map((t) => (
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
                  <TeamBadge link={false} name={g.league} src={g.badge} size={32} label={competitionLabel(g.league)} />
                  <span>
                    <strong>{g.slug ? <Link href={paths.league(g.slug)}>{g.league}</Link> : g.league}</strong>
                    <span className="cm-group__country">
                      <Flag country={g.country && danishCountry(g.country)} /> {g.country && danishCountry(g.country)}
                    </span>
                  </span>
                </div>
                <ul className="cm-list">
                  {g.matches.map((m) => (
                    <ClubMatchRow key={m.id} match={m} clubName={clubName} showTv={showTv} />
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

function ClubMatchRow({ match, clubName, showTv }: { match: Match; clubName: string; showTv?: boolean }) {
  const outcome = outcomeFor(match, clubName)
  // The channel showing a match to come, where the score will stand
  const channel = showTv && match.state === 'upcoming' ? channelsFor(match)[0]?.name : undefined
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
      {/* Saved games from the statistics bank have no page of their own */}
      {match.slug && <Link className="stretched-link" href={paths.match(match.slug)} aria-label={`${match.home.name} – ${match.away.name}`} />}
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
      {channel && (
        <span className="cm-row__tv" title={`Vises på ${channel}`}>
          <span className="visually-hidden">Vises på </span>
          {channel}
        </span>
      )}
      <span className="cm-row__score" hidden={!!channel}>
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
        !channel && <span />
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
