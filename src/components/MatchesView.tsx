'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { LiveStrip } from './LiveStrip'
import { DateStrip } from './DateStrip'
import { FilterBar } from './FilterBar'
import { LeagueSection } from './LeagueSection'
import { MatchRow } from './MatchRow'
import { OddsBy } from './MatchExtras'
import { RESPONSIBLE_GAMBLING } from '../data/partners'
import { Sidebar } from './Sidebar'
import { FeaturedMatch } from './FeaturedMatch'
import { StatTiles } from './StatTiles'
import { AdSlot } from './AdSlot'
import { FEED_AD_EVERY, FEED_AD_FIRST } from '../data/ads'
import { useNow } from '../hooks/useNow'
import { usePersistentState } from '../hooks/usePersistentState'
import { getMatches } from '../data/matches'
import { getRealData } from '../data/real'
import { nearestMatchDay, realLeagues, upcomingMatches } from '../data/season'
import Link from 'next/link'
import { paths } from '../lib/site'
import { fetchEventsByDay } from '../api/thesportsdb'
import { addDays, danishTime, formatDayMonth, formatLong, formatTime, isoDate } from '../lib/time'
import { sportById } from '../sports'
import type { LeagueGroup, Match, SportId, StateFilter } from '../types'

export type DataSource = 'fictional' | 'api'

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
        matches: [],
      }
      map.set(m.leagueId, g)
    }
    g.matches.push(m)
  }
  const groups = [...map.values()]
  for (const g of groups) g.matches.sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime())

  // Favourites first, then the league's own order (Superliga before 1. division),
  // then leagues with live matches, then alphabetically
  const rank = (g: LeagueGroup) =>
    (pinned.has(g.leagueId) ? 0 : 1000) +
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
  sport: SportId
  date: string
  today: string
  initialNow: number
}

export function MatchesView({ sport, date, today, initialNow }: Props) {
  const [source, setSource] = usePersistentState<DataSource>('dataSource', 'fictional')
  const [pinnedList, setPinnedList] = usePersistentState<string[]>('pinnedLeagues', [])
  const [filter, setFilter] = useState<StateFilter>('all')
  const [order, setOrder] = usePersistentState<'time' | 'league'>('listOrder', 'time')
  const [query, setQuery] = useState('')
  const [tick, setTick] = useState(0)
  const now = useNow(REFRESH_MS, initialNow)

  // Recomputed when new data arrives (the version changes) as well as when time passes
  const dataVersion = getRealData()?.version
  const fictional = useMemo(() => getMatches(date, sport, now), [date, sport, now, dataVersion]) // eslint-disable-line react-hooks/exhaustive-deps

  // Live data from TheSportsDB, only when chosen; falls back to fictional data
  const apiKey = `${date}|${sport}|${tick}`
  const [api, setApi] = useState<{ key: string; matches?: Match[]; error?: string }>()
  useEffect(() => {
    if (source !== 'api') return
    const controller = new AbortController()
    fetchEventsByDay(date, sport, sportById(sport).apiName, controller.signal)
      .then((matches) => setApi({ key: apiKey, matches }))
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setApi({ key: apiKey, error: err instanceof Error ? err.message : 'Ukendt fejl' })
      })
    return () => controller.abort()
  }, [source, date, sport, apiKey])

  const apiReady = source === 'api' && api?.key === apiKey
  const usingApi = apiReady && !!api?.matches
  const matches = usingApi ? api!.matches! : fictional
  const apiError = apiReady ? api?.error : undefined

  // The time view lists the chosen day and the ten days after it
  const DAYS_AHEAD = 10
  const range = useMemo(
    () => (order === 'time' && !usingApi ? Array.from({ length: DAYS_AHEAD + 1 }, (_, i) => getMatches(addDays(date, i), sport, now)).flat() : matches),
    [order, usingApi, date, sport, now, matches, dataVersion], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const pinned = useMemo(() => new Set(pinnedList), [pinnedList])
  const togglePin = (id: string) =>
    setPinnedList((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]))

  const searched = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return range
    return range.filter((m) =>
      [m.home.name, m.away.name, m.league, m.country ?? ''].some((s) => s.toLowerCase().includes(q)),
    )
  }, [range, query])

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
  // Every match by kick-off, then by league order, one section per day
  const days = useMemo(() => {
    const sorted = [...visible].sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime() || (a.leagueOrder ?? 99) - (b.leagueOrder ?? 99))
    const byDay = new Map<string, Match[]>()
    for (const m of sorted) {
      const d = isoDate(m.kickoff)
      if (!byDay.has(d)) byDay.set(d, [])
      byDay.get(d)!.push(m)
    }
    return [...byDay.entries()]
  }, [visible])
  const allGroups = useMemo(() => groupByLeague(matches, pinned), [matches, pinned])
  const liveCount = matches.filter((m) => m.state === 'live').length
  const sportDef = sportById(sport)
  // The next 8 matches over the coming 10 days (from TheSportsDB data when that is chosen)
  const upcoming = useMemo(() => {
    if (!usingApi) return upcomingMatches(sport, now)
    return matches.filter((m) => m.state === 'upcoming').sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime()).slice(0, 8)
  }, [usingApi, matches, sport, now, dataVersion]) // eslint-disable-line react-hooks/exhaustive-deps
  const nextDay = nearestMatchDay(date, sport, 1)
  const prevDay = nearestMatchDay(date, sport, -1)
  // Next real match from the chosen day on (or from now when that is later)
  const real = realLeagues(Math.max(now, danishTime(date, '00:00').getTime())).filter((l) => l.division.sport === undefined ? sport === 'soccer' : l.division.sport === sport)
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

      <LiveStrip matches={searched} upcoming={upcoming} now={now} />

      {!usingApi && (apiError || (sport === 'soccer' && real.length === 0) || noMatchLeagues.length > 0) && (
        <div className="banner" role="status">
          {apiError ? (
            'Live-data kunne ikke hentes, så du ser vores egne data.'
          ) : real.length === 0 ? (
            'Kampene hentes fra TheSportsDB – kom tilbage om lidt.'
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
        <Sidebar groups={allGroups} pinned={pinned} />

        <main className="feed">
          <div className="feed__head">
            <h1 className="feed__title">
              {sportDef.label}
              <span>{order === 'time' && !usingApi ? `${formatDayMonth(date)} – ${formatDayMonth(addDays(date, DAYS_AHEAD))}` : formatLong(date)}</span>
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
                        {list.some((m) => m.state === 'upcoming') && <OddsBy />}
                      </div>
                    </header>
                    <ul className="league__matches">
                      {list.map((m) => (
                        <MatchRow key={m.id} match={m} showLeague />
                      ))}
                    </ul>
                    {list.some((m) => m.state === 'upcoming') && (
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
          <FeaturedMatch matches={matches} pinned={pinned} now={now} />
          <StatTiles
            matches={matches}
            updatedAt={new Date(now)}
            source={source}
            onSourceChange={setSource}
            onRefresh={() => setTick((t) => t + 1)}
          />
          <AdSlot placement="side" />
        </aside>
      </div>
    </div>
  )
}
