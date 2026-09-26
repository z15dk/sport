'use client'

import { Fragment, useMemo, useState } from 'react'
import { LiveStrip } from './LiveStrip'
import { DateStrip } from './DateStrip'
import { FilterBar } from './FilterBar'
import { LeagueSection } from './LeagueSection'
import { MatchRow } from './MatchRow'
import { OddsBy } from './MatchExtras'
import { RESPONSIBLE_GAMBLING } from '../data/partners'
import { oddsEnabled } from '../data/odds'
import { Sidebar } from './Sidebar'
import { FeaturedMatch } from './FeaturedMatch'
import { SportTabs } from './SportTabs'
import { AdSlot } from './AdSlot'
import { FEED_AD_EVERY, FEED_AD_FIRST } from '../data/ads'
import { useNow } from '../hooks/useNow'
import { usePersistentState } from '../hooks/usePersistentState'
import { externalMatch, getMatches, nearestMatchDay, upcomingMatches } from '../data/matches'
import { cupOfGame } from '../data/cups'
import { MyTeams } from './MyTeams'
import { getRealData } from '../data/real'
import { realLeagues } from '../data/season'
import { DIVISIONS, shownDivisions, sportOf } from '../data/leagues'
import Link from 'next/link'
import { paths } from '../lib/site'
import { addDays, danishTime, formatDayMonth, formatLong, formatTime, isoDate } from '../lib/time'
import { ALL_SPORTS, sportById } from '../sports'
import type { LeagueGroup, Match, SportFilter, StateFilter } from '../types'


const STATE_ORDER = { live: 0, upcoming: 1, finished: 2, postponed: 3 } as const
const REFRESH_MS = 30_000

function groupByLeague(matches: Match[], pinned: Set<string>): LeagueGroup[] {
  const map = new Map<string, LeagueGroup>()
  for (const m of matches) {
    let g = map.get(m.leagueId)
    if (!g) {
      g = {
        leagueId: m.leagueId,
        leagueSlug: m.leagueSlug,
        league: m.league,
        country: m.country,
        leagueBadge: m.leagueBadge,
        order: m.leagueOrder,
        matches: [],
      }
      map.set(m.leagueId, g)
    }
    g.matches.push(m)
  }
  const groups = [...map.values()]
  for (const g of groups) g.matches.sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime())

  // Favourites first, then leagues being played right now, then the league's own
  // order (Superliga before 1. division), then alphabetically
  const rank = (g: LeagueGroup) =>
    (pinned.has(g.leagueId) ? 0 : 100_000) +
    (g.matches.some((m) => m.state === 'live') ? 0 : 10_000) +
    (g.matches[0].leagueOrder ?? 99) * 10 +
    Math.min(...g.matches.map((m) => STATE_ORDER[m.state]))
  return groups.sort((a, b) => rank(a) - rank(b) || a.league.localeCompare(b.league, 'da'))
}

/** Feed ads after the FEED_AD_FIRST-th league, then every FEED_AD_EVERY; never as the very last item */
function isFeedAdSpot(i: number, total: number): boolean {
  const n = i + 1
  return n < total && n >= FEED_AD_FIRST && (n - FEED_AD_FIRST) % FEED_AD_EVERY === 0
}

interface Props {
  sport: SportFilter
  date: string
  today: string
  initialNow: number
}

export function MatchesView({ sport, date, today, initialNow }: Props) {
  const [pinnedList, setPinnedList] = usePersistentState<string[]>('pinnedLeagues', [])
  const [filter, setFilter] = useState<StateFilter>('all')
  // Tournament picked in the sidebar; it belongs to the sport it was picked in
  const [picked, setPicked] = useState<{ sport: SportFilter; id: string }>()
  const league = picked?.sport === sport ? picked.id : undefined
  const setLeague = (id: string | undefined) => {
    setPicked(id ? { sport, id } : undefined)
    // On phones the tournaments are under the list: go back up to it
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches) {
      document.getElementById('kampe')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }
  const [order, setOrder] = usePersistentState<'time' | 'league'>('listOrder', 'time')
  const [query, setQuery] = useState('')
  const now = useNow(REFRESH_MS, initialNow)

  // Recomputed when new data arrives (the version changes) as well as when time passes
  const dataVersion = getRealData()?.version
  const fictional = useMemo(() => getMatches(date, sport, now), [date, sport, now, dataVersion]) // eslint-disable-line react-hooks/exhaustive-deps

  const matches = fictional

  // The time view lists the chosen day and the ten days after it
  const DAYS_AHEAD = 10
  const range = useMemo(
    () => (order === 'time' ? Array.from({ length: DAYS_AHEAD + 1 }, (_, i) => getMatches(addDays(date, i), sport, now)).flat() : matches),
    [order, date, sport, now, matches, dataVersion], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const pinned = useMemo(() => new Set(pinnedList), [pinnedList])
  const togglePin = (id: string) =>
    setPinnedList((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]))

  const searched = useMemo(() => {
    const q = query.trim().toLowerCase()
    const inLeague = league ? range.filter((m) => m.leagueId === league) : range
    if (!q) return inLeague
    return inLeague.filter((m) =>
      [m.home.name, m.away.name, m.league, m.country ?? ''].some((s) => s.toLowerCase().includes(q)),
    )
  }, [range, query, league])

  const counts = useMemo(
    () => ({
      all: searched.length,
      live: searched.filter((m) => m.state === 'live').length,
      upcoming: searched.filter((m) => m.state === 'upcoming').length,
      finished: searched.filter((m) => m.state === 'finished').length,
    }),
    [searched],
  )

  const visible = filter === 'all' ? searched : searched.filter((m) => m.state === filter)
  const groups = useMemo(() => groupByLeague(visible, pinned), [visible, pinned])
  // One section per day: matches being played right now first, then the rest by kick-off and league order
  const days = useMemo(() => {
    const liveFirst = (m: Match) => (m.state === 'live' ? 0 : 1)
    const sorted = [...visible].sort(
      (a, b) => liveFirst(a) - liveFirst(b) || a.kickoff.getTime() - b.kickoff.getTime() || (a.leagueOrder ?? 99) - (b.leagueOrder ?? 99),
    )
    const byDay = new Map<string, Match[]>()
    for (const m of sorted) {
      const d = isoDate(m.kickoff)
      if (!byDay.has(d)) byDay.set(d, [])
      byDay.get(d)!.push(m)
    }
    return [...byDay.entries()]
  }, [visible])
  // The sidebar lists every league we cover in the chosen sport, also those without matches this day
  const allGroups = useMemo(() => {
    const groups = groupByLeague(matches, pinned)
    const have = new Set(groups.map((g) => g.leagueId))
    const covered = DIVISIONS.flatMap((d, i): LeagueGroup[] => {
      const leagueId = `${d.countryCode.toLowerCase()}-${d.id}`
      if (have.has(leagueId) || (sport !== 'all' && sportOf(d) !== sport) || !shownDivisions().includes(d)) return []
      return [{ leagueId, leagueSlug: d.slug, league: d.name, country: d.country, order: i, matches: [] }]
    })
    // The cups we follow, also on days without cup games
    const cups: LeagueGroup[] = []
    if (sport === 'all' || sport === 'soccer') {
      for (const g of getRealData()?.external ?? []) {
        if (!cupOfGame(g)) continue
        const m = externalMatch(g)
        if (have.has(m.leagueId) || cups.some((c) => c.leagueId === m.leagueId)) continue
        cups.push({ leagueId: m.leagueId, leagueSlug: m.leagueSlug, league: m.league, country: m.country, leagueBadge: m.leagueBadge, order: m.leagueOrder, matches: [] })
      }
    }
    return [...groups, ...covered, ...cups]
  }, [matches, pinned, sport, dataVersion]) // eslint-disable-line react-hooks/exhaustive-deps
  const liveCount = matches.filter((m) => m.state === 'live').length
  const sportDef = sport === 'all' ? ALL_SPORTS : sportById(sport)
  // Match in focus: kick-off 12-24 hours ahead, counted from the start of the hour so the pick stays put for the hour
  const hour = Math.floor(now / 3_600_000)
  const featured = useMemo(() => {
    const from = hour * 3_600_000 + 12 * 3_600_000
    const start = hour * 3_600_000
    return upcomingMatches(sport, isoDate(start), start, 2, 10_000).filter((m) => m.kickoff.getTime() >= from && m.kickoff.getTime() <= start + 24 * 3_600_000)
  }, [sport, hour, dataVersion]) // eslint-disable-line react-hooks/exhaustive-deps
  // The next 8 matches over the coming 10 days (from TheSportsDB data when that is chosen)
  const upcoming = useMemo(() => upcomingMatches(sport, today, now), [sport, today, now, dataVersion]) // eslint-disable-line react-hooks/exhaustive-deps
  const nextDay = useMemo(() => nearestMatchDay(date, sport, 1, now), [date, sport, now, dataVersion]) // eslint-disable-line react-hooks/exhaustive-deps
  const prevDay = useMemo(() => nearestMatchDay(date, sport, -1, now), [date, sport, now, dataVersion]) // eslint-disable-line react-hooks/exhaustive-deps
  // Next real match from the chosen day on (or from now when that is later)
  const real = realLeagues(Math.max(now, danishTime(date, '00:00').getTime())).filter((l) => sport === 'all' || (l.division.sport ?? 'soccer') === sport)
  // Only the top leagues are named when they have no matches, to keep the note short
  const noMatchLeagues = real.filter((l) => l.division.id === 'superliga' && !matches.some((m) => m.leagueSlug === l.division.slug))

  return (
    <div className="page">
      <div className="toolbar">
        <label className="search">
          <span className="visually-hidden">Søg efter hold eller turnering</span>
          <svg viewBox="0 0 24 24" aria-hidden className="search__icon">
            <path d="M10.5 3a7.5 7.5 0 015.96 12.06l4.24 4.24-1.4 1.4-4.24-4.24A7.5 7.5 0 1110.5 3zm0 2a5.5 5.5 0 100 11 5.5 5.5 0 000-11z" />
          </svg>
          <input
            id="search"
            type="search"
            placeholder="Søg hold eller turnering"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <button className="live-chip" onClick={() => setFilter('live')} disabled={liveCount === 0}>
          <span className="live-dot" aria-hidden />
          {liveCount} live
        </button>
      </div>

      {/* On phones the sports come first, above the live strip */}
      <SportTabs active={sport} className="sport-tabs--mobile" />

      <LiveStrip matches={searched} upcoming={league ? upcoming.filter((m) => m.leagueId === league) : upcoming} now={now} />

      {(((sport === 'soccer' || sport === 'all') && real.length === 0) || noMatchLeagues.length > 0) && (
        <div className="banner" role="status">
          {real.length === 0 ? (
            'Kampene hentes – kom tilbage om lidt.'
          ) : (
            <>
              Ingen kampe denne dag i{' '}
              {noMatchLeagues.map(({ division, next }, i) => (
                <span key={division.id}>
                  {i > 0 && (i === noMatchLeagues.length - 1 ? ' og ' : ', ')}
                  <Link href={paths.league(division.slug)}>{division.name}</Link>
                  {next && ` (næste: ${next.home.name} – ${next.away.name} ${formatLong(next.kickoff)} kl. ${formatTime(next.kickoff)})`}
                </span>
              ))}
              .
            </>
          )}
        </div>
      )}

      <div className="grid">
        <Sidebar groups={allGroups} pinned={pinned} selected={league} onSelect={setLeague} />

        <main className="feed" id="kampe">
          <MyTeams now={now} />
          <SportTabs active={sport} className="sport-tabs--desktop" />
          <div className="feed__head">
            <h1 className="feed__title">
              {sportDef.label}
              <span>{order === 'time' ? `${formatDayMonth(date)} – ${formatDayMonth(addDays(date, DAYS_AHEAD))}` : formatLong(date)}</span>
            </h1>
            <FilterBar value={filter} onChange={setFilter} counts={counts} />
            <div className="switch switch--order" role="group" aria-label="Sortering">
              <button className={order === 'time' ? 'is-active' : ''} aria-pressed={order === 'time'} onClick={() => setOrder('time')}>
                Tid
              </button>
              <button className={order === 'league' ? 'is-active' : ''} aria-pressed={order === 'league'} onClick={() => setOrder('league')}>
                Turnering
              </button>
            </div>
          </div>
          <DateStrip selected={date} today={today} sport={sportDef.slug} />

          {(order === 'time' ? days.length === 0 : groups.length === 0) ? (
            <div className="panel empty">
              <p>{query ? `Ingen kampe matcher “${query}”.` : 'Ingen kampe for den valgte dag og filter.'}</p>
              {!query && (nextDay || prevDay) && (
                <p className="empty__links">
                  {nextDay && (
                    <Link className="pill is-active" href={paths.home({ sport: sportDef.slug, dato: nextDay })}>
                      Næste kampdag: {formatLong(nextDay)} →
                    </Link>
                  )}
                  {prevDay && (
                    <Link className="pill" href={paths.home({ sport: sportDef.slug, dato: prevDay })}>
                      ← Seneste resultater: {formatLong(prevDay)}
                    </Link>
                  )}
                </p>
              )}
            </div>
          ) : order === 'time' ? (
            <div className="league-list">
              {days.map(([day, list], i) => (
                <Fragment key={day}>
                  <section className="league">
                    <header className="league__header">
                      <div className="league__toggle">
                        <span className="league__titles">
                          <span className="league__country">{list.length === 1 ? '1 kamp' : `${list.length} kampe`}</span>
                          <h2 className="league__name">{day === today ? `I dag · ${formatLong(day)}` : formatLong(day)}</h2>
                        </span>
                        {list.some((m) => m.state === 'upcoming') && oddsEnabled() && <OddsBy />}
                      </div>
                    </header>
                    <ul className="league__matches">
                      {list.map((m) => (
                        <MatchRow key={m.id} match={m} showLeague showSport={sport === 'all'} />
                      ))}
                    </ul>
                    {list.some((m) => m.state === 'upcoming') && oddsEnabled() && (
                      <a className="league__rg" href={RESPONSIBLE_GAMBLING.url} target="_blank" rel="noopener nofollow">
                        {RESPONSIBLE_GAMBLING.text}
                      </a>
                    )}
                  </section>
                  {isFeedAdSpot(i, days.length) && (
                    <AdSlot placement="feed" index={Math.floor((i + 1 - FEED_AD_FIRST) / FEED_AD_EVERY) + 1} />
                  )}
                </Fragment>
              ))}
            </div>
          ) : (
            <div className="league-list">
              {groups.map((g, i) => (
                <Fragment key={g.leagueId}>
                  <LeagueSection
                    group={g}
                    pinned={pinned.has(g.leagueId)}
                    onTogglePin={() => togglePin(g.leagueId)}
                  />
                  {isFeedAdSpot(i, groups.length) && (
                    <AdSlot placement="feed" index={Math.floor((i + 1 - FEED_AD_FIRST) / FEED_AD_EVERY) + 1} />
                  )}
                </Fragment>
              ))}
            </div>
          )}
        </main>

        <aside className="aside">
          <FeaturedMatch candidates={featured} matches={matches} pinned={pinned} now={now} seed={`${sport}|${hour}`} />

          <AdSlot placement="side" />
        </aside>
      </div>
    </div>
  )
}
