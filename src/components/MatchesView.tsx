'use client'

import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { SportSprite } from './SportIcon'
import { LiveStrip } from './LiveStrip'
import { DateStrip } from './DateStrip'
import { FilterBar } from './FilterBar'
import { LeagueSection } from './LeagueSection'
import { MatchRow } from './MatchRow'
import { OddsBy } from './MatchExtras'
import { RESPONSIBLE_GAMBLING } from '../data/partners'
import { oddsEnabled } from '../data/odds'
import { Sidebar } from './Sidebar'
import { WidgetPromo } from './WidgetPromo'
import { FeaturedMatch } from './FeaturedMatch'
import { SportTabs } from './SportTabs'
import { AdSlot } from './AdSlot'
import { chunksWithAds, feedAdPlan, SCROLL_AD_AFTER } from '../data/ads'
import { useNow } from '../hooks/useNow'
import { usePersistentState } from '../hooks/usePersistentState'
import { externalMatch, getMatches, isWomenGame, isWomenMatch, nearestMatchDay, upcomingMatches } from '../data/matches'
import { cupOfGame } from '../data/cups'
import { MyTeams } from './MyTeams'
import { ListMore } from './ListMore'
import { getRealData } from '../data/real'
import { realLeagues } from '../data/season'
import { DIVISIONS, shownDivisions, sportOf } from '../data/leagues'
import Link from 'next/link'
import { paths } from '../lib/site'
import { addDays, danishTime, formatDayMonth, formatLong, isoDate } from '../lib/time'
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


interface Props {
  /** The page's heading instead of the sport's name ("Resultater i går") */
  heading?: string
  /** The nearest days with matches before and after `date` (server) */
  nearDays?: { prev?: string; next?: string }
  /** The next matches over the coming ten days (server) */
  upcoming?: Match[]
  sport: SportFilter
  date: string
  today: string
  initialNow: number
  /** "Live" in the menu opens the page on the matches being played */
  initialFilter?: StateFilter
  /** Women's games only (/kvindesport, /kvindefodbold): of `sport`, or of every sport */
  women?: boolean
  /** The front page: the full-screen ad between the leagues (only there) */
  scrollAd?: boolean
  /** First on the page (the women's pages' big top) */
  top?: ReactNode
  /** Above the list instead of the sports' tabs (the women's pages' own tabs) */
  tabs?: ReactNode
  /** Under the list and the sidebar */
  below?: ReactNode
}

/** Matches in the page's HTML; the rest follow as the reader scrolls (fewer rows = less HTML to parse and hydrate on phones) */
const FIRST_ROWS = 100
/** Rows added each time the end of the list comes near */
const MORE_ROWS = 80

export function MatchesView({ sport, date, today, initialNow, initialFilter = 'all', nearDays, upcoming: upcomingGiven, heading, women, scrollAd, top, tabs, below }: Props) {
  // The day's matches: all of the sport's, or only the women's
  const dayMatches = (d: string, n: number) => (women ? getMatches(d, sport, n).filter(isWomenMatch) : getMatches(d, sport, n))
  const [pinnedList, setPinnedList] = usePersistentState<string[]>('pinnedLeagues', [])
  const [filter, setFilter] = useState<StateFilter>(initialFilter)
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
  // The site's search (top bar) finds clubs and tournaments; the day's matches are not filtered by text
  const query = ''
  const now = useNow(REFRESH_MS, initialNow)

  // Recomputed when new data arrives (the version changes) as well as when time passes
  const dataVersion = getRealData()?.version
  const fictional = useMemo(() => dayMatches(date, now), [date, sport, now, dataVersion, women]) // eslint-disable-line react-hooks/exhaustive-deps

  const matches = fictional

  // The time view lists the chosen day only (more days made the page slow); "Næste kampdag" goes on
  const DAYS_AHEAD = 0
  const range = useMemo(
    () => (order === 'time' ? Array.from({ length: DAYS_AHEAD + 1 }, (_, i) => dayMatches(addDays(date, i), now)).flat() : matches),
    [order, date, sport, now, matches, dataVersion, women], // eslint-disable-line react-hooks/exhaustive-deps
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
  // The page's HTML carries the first matches only (a busy day has more than a thousand, megabytes of HTML);
  // the rest are drawn when the reader scrolls down to them (ListMore), a few at a time, so a phone never
  // lays out a thousand rows nobody looks at
  const [cap, setCap] = useState(FIRST_ROWS)
  const allGroups0 = useMemo(() => groupByLeague(visible, pinned), [visible, pinned])
  const groups = useMemo(() => {
    if (cap === Infinity) return allGroups0
    let n = 0
    return allGroups0.filter((g) => (n += g.matches.length) - g.matches.length < cap)
  }, [allGroups0, cap])
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
    let n = 0
    return [...byDay.entries()]
      .map(([d, list]): [string, Match[], number] => {
        const shown = list.slice(0, Math.max(0, cap - n))
        n += shown.length
        return [d, shown, list.length]
      })
      .filter(([, list]) => list.length > 0)
  }, [visible, cap])
  // Where the ads go in each view: counted in match rows, so they come at even intervals (src/data/ads.ts)
  const groupPlan = useMemo(() => feedAdPlan(groups.map((g) => g.matches.length)), [groups])
  const dayPlan = useMemo(() => feedAdPlan(days.map(([, list]) => list.length)), [days])
  // The sidebar lists every league we cover in the chosen sport, also those without matches this day
  const allGroups = useMemo(() => {
    const groups = groupByLeague(matches, pinned)
    const have = new Set(groups.map((g) => g.leagueId))
    const covered = DIVISIONS.flatMap((d, i): LeagueGroup[] => {
      const leagueId = `${d.countryCode.toLowerCase()}-${d.id}`
      if (women || have.has(leagueId) || (sport !== 'all' && sportOf(d) !== sport) || !shownDivisions().includes(d)) return []
      return [{ leagueId, leagueSlug: d.slug, league: d.name, country: d.country, order: i, matches: [] }]
    })
    // The cups we follow, also on days without cup games
    const cups: LeagueGroup[] = []
    if (sport === 'all' || sport === 'soccer') {
      for (const g of getRealData()?.external ?? []) {
        if (!cupOfGame(g) || (women && !isWomenGame(g))) continue
        const m = externalMatch(g)
        if (have.has(m.leagueId) || cups.some((c) => c.leagueId === m.leagueId)) continue
        cups.push({ leagueId: m.leagueId, leagueSlug: m.leagueSlug, league: m.league, country: m.country, leagueBadge: m.leagueBadge, order: m.leagueOrder, matches: [] })
      }
    }
    return [...groups, ...covered, ...cups]
  }, [matches, pinned, sport, dataVersion]) // eslint-disable-line react-hooks/exhaustive-deps
  const sportDef = sport === 'all' ? ALL_SPORTS : sportById(sport)
  // Match in focus: kick-off 12-24 hours ahead, counted from the start of the hour so the pick stays put for the hour
  const hour = Math.floor(now / 3_600_000)
  const featured = useMemo(() => {
    const from = hour * 3_600_000 + 12 * 3_600_000
    const start = hour * 3_600_000
    return upcomingMatches(sport, isoDate(start), start, 2, 10_000)
      .filter((m) => m.kickoff.getTime() >= from && m.kickoff.getTime() <= start + 24 * 3_600_000)
      .filter((m) => !women || isWomenMatch(m))
  }, [sport, hour, dataVersion, women]) // eslint-disable-line react-hooks/exhaustive-deps
  // The next 8 matches over the coming 10 days (from TheSportsDB data when that is chosen)
  // From the server when given (it has the ten days; the browser only the days shown)
  const upcoming = useMemo(
    () => (upcomingGiven ? upcomingGiven.filter((m) => m.state === 'live' || m.kickoff.getTime() > now) : upcomingMatches(sport, today, now).filter((m) => !women || isWomenMatch(m))),
    [upcomingGiven, sport, today, now, dataVersion], // eslint-disable-line react-hooks/exhaustive-deps
  )
  // Worked out on the server, which has every day's games (the browser only gets the days shown)
  const nextDay = useMemo(() => (nearDays ? nearDays.next : nearestMatchDay(date, sport, 1, now)), [nearDays, date, sport, now, dataVersion]) // eslint-disable-line react-hooks/exhaustive-deps
  const prevDay = useMemo(() => (nearDays ? nearDays.prev : nearestMatchDay(date, sport, -1, now)), [nearDays, date, sport, now, dataVersion]) // eslint-disable-line react-hooks/exhaustive-deps
  // Next real match from the chosen day on (or from now when that is later)
  const real = realLeagues(Math.max(now, danishTime(date, '00:00').getTime())).filter((l) => sport === 'all' || (l.division.sport ?? 'soccer') === sport)
  const dayHref = (d: string) => (women ? paths.women({ sport: sportDef.slug, dato: d, today }) : paths.home({ sport: sportDef.slug, dato: d, today }))
  // The women's pages have their heading in the top above
  const Title = women ? 'h2' : 'h1'
  return (
    <div className="page">
      {top}
      {/* On phones the sports come first, above the live strip */}
      {!women && <SportTabs active={sport} className="sport-tabs--mobile" />}

      <LiveStrip matches={searched} upcoming={league ? upcoming.filter((m) => m.leagueId === league) : upcoming} now={now} />

      {!women && (sport === 'soccer' || sport === 'all') && real.length === 0 && (
        <div className="banner" role="status">
          Kampene hentes – kom tilbage om lidt.
        </div>
      )}

      <SportSprite />
      <div className="grid">
        <Sidebar groups={allGroups} pinned={pinned} selected={league} onSelect={setLeague} />

        <main className="feed" id="kampe">
          {!women && <MyTeams now={now} />}
          {!women && <SportTabs active={sport} className="sport-tabs--desktop" />}
          {tabs}
          <div className="feed__head">
            <Title className="feed__title">
              {heading ?? sportDef.label}
              <span>{order === 'time' && DAYS_AHEAD > 0 ? `${formatDayMonth(date)} – ${formatDayMonth(addDays(date, DAYS_AHEAD))}` : formatLong(date)}</span>
            </Title>
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
          <DateStrip selected={date} today={today} sport={sportDef.slug} women={women} />

          {(order === 'time' ? days.length === 0 : groups.length === 0) ? (
            <div className="panel empty">
              <p>{query ? `Ingen kampe matcher “${query}”.` : 'Ingen kampe for den valgte dag og filter.'}</p>
              {!query && (nextDay || prevDay) && (
                <p className="empty__links">
                  {nextDay && (
                    <Link className="pill is-active" href={dayHref(nextDay)}>
                      Næste kampdag: {formatLong(nextDay)} →
                    </Link>
                  )}
                  {prevDay && (
                    <Link className="pill" href={dayHref(prevDay)}>
                      ← Seneste resultater: {formatLong(prevDay)}
                    </Link>
                  )}
                </p>
              )}
            </div>
          ) : order === 'time' ? (
            <div className="league-list">
              {days.map(([day, list, total], i) => (
                <Fragment key={day}>
                  <section className="league">
                    <header className="league__header">
                      <div className="league__toggle">
                        <span className="league__titles">
                          <span className="league__country">{total === 1 ? '1 kamp' : `${total} kampe`}</span>
                          <h2 className="league__name">{day === today ? `I dag · ${formatLong(day)}` : formatLong(day)}</h2>
                        </span>
                        {list.some((m) => m.state === 'upcoming') && oddsEnabled() && <OddsBy />}
                      </div>
                    </header>
                    {chunksWithAds(list, dayPlan[i]).map((chunk, k) => (
                      <Fragment key={k}>
                        <ul className="league__matches">
                          {chunk.rows.map((m) => (
                            <MatchRow key={m.id} match={m} showLeague showSport={sport === 'all'} />
                          ))}
                        </ul>
                        {chunk.ad && <AdSlot placement="feed" index={chunk.ad} className="ad--inside" />}
                      </Fragment>
                    ))}
                    {list.some((m) => m.state === 'upcoming') && oddsEnabled() && (
                      <a className="league__rg" href={RESPONSIBLE_GAMBLING.url} target="_blank" rel="noopener nofollow">
                        {RESPONSIBLE_GAMBLING.text}
                      </a>
                    )}
                  </section>
                  {dayPlan[i].after && <AdSlot placement="feed" index={dayPlan[i].after} />}
                  {scrollAd && i + 1 === SCROLL_AD_AFTER && i + 1 < days.length && <AdSlot placement="scroll" />}
                </Fragment>
              ))}
              <ListMore left={visible.length - days.reduce((n, [, list]) => n + list.length, 0)} onMore={() => setCap((c) => c + MORE_ROWS)} />
            </div>
          ) : (
            <div className="league-list">
              {groups.map((g, i) => (
                <Fragment key={g.leagueId}>
                  <LeagueSection
                    group={g}
                    pinned={pinned.has(g.leagueId)}
                    onTogglePin={() => togglePin(g.leagueId)}
                    ads={groupPlan[i]}
                  />
                  {groupPlan[i].after && <AdSlot placement="feed" index={groupPlan[i].after} />}
                  {scrollAd && i + 1 === SCROLL_AD_AFTER && i + 1 < groups.length && <AdSlot placement="scroll" />}
                </Fragment>
              ))}
              <ListMore left={visible.length - groups.reduce((n, g) => n + g.matches.length, 0)} onMore={() => setCap((c) => c + MORE_ROWS)} />
            </div>
          )}
        </main>

        <aside className="aside">
          <FeaturedMatch candidates={featured} matches={matches} pinned={pinned} now={now} seed={`${women ? 'women' : sport}|${hour}`} />
          <WidgetPromo />

          <AdSlot placement="side" />
        </aside>
      </div>
      {below}
    </div>
  )
}
