import { useMemo, useState } from 'react'
import { Header } from './components/Header'
import { SportRail } from './components/SportRail'
import { LiveStrip } from './components/LiveStrip'
import { DateStrip } from './components/DateStrip'
import { FilterBar } from './components/FilterBar'
import { LeagueSection } from './components/LeagueSection'
import { Sidebar } from './components/Sidebar'
import { FeaturedMatch } from './components/FeaturedMatch'
import { StatTiles } from './components/StatTiles'
import { useMatches } from './hooks/useMatches'
import { usePersistentState } from './hooks/usePersistentState'
import { formatLong, isSameDay, toIsoDate } from './dates'
import { SPORTS } from './sports'
import type { LeagueGroup, Match, SportId, StateFilter } from './types'

const STATE_ORDER = { live: 0, upcoming: 1, finished: 2, postponed: 3 } as const

function groupByLeague(matches: Match[], pinned: Set<string>): LeagueGroup[] {
  const map = new Map<string, LeagueGroup>()
  for (const m of matches) {
    let g = map.get(m.leagueId)
    if (!g) {
      g = { leagueId: m.leagueId, league: m.league, country: m.country, leagueBadge: m.leagueBadge, matches: [] }
      map.set(m.leagueId, g)
    }
    g.matches.push(m)
  }
  const groups = [...map.values()]
  for (const g of groups) g.matches.sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime())

  const rank = (g: LeagueGroup) =>
    (pinned.has(g.leagueId) ? 0 : 10) + Math.min(...g.matches.map((m) => STATE_ORDER[m.state]))
  return groups.sort((a, b) => rank(a) - rank(b) || a.league.localeCompare(b.league, 'da'))
}

export default function App() {
  const [pinnedList, setPinnedList] = usePersistentState<string[]>('pinnedLeagues', [])
  const [sport, setSport] = useState<SportId>('soccer')
  const [date, setDate] = useState(() => new Date())
  const [filter, setFilter] = useState<StateFilter>('all')
  const [query, setQuery] = useState('')

  const isToday = isSameDay(date, new Date())
  const { matches, loading, error, isDemo, updatedAt, refresh } = useMatches(toIsoDate(date), sport, isToday)

  const pinned = useMemo(() => new Set(pinnedList), [pinnedList])
  const togglePin = (id: string) =>
    setPinnedList((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]))

  const searched = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return matches
    return matches.filter((m) =>
      [m.home.name, m.away.name, m.league, m.country ?? ''].some((s) => s.toLowerCase().includes(q)),
    )
  }, [matches, query])

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
  const allGroups = useMemo(() => groupByLeague(matches, pinned), [matches, pinned])
  const liveCount = matches.filter((m) => m.state === 'live').length
  const sportLabel = SPORTS.find((s) => s.id === sport)!.label

  return (
    <div className="app">
      <SportRail value={sport} onChange={setSport} />

      <div className="app__main">
        <Header
          query={query}
          onQueryChange={setQuery}
          liveCount={liveCount}
          onShowLive={() => setFilter('live')}
        />

        <div className="page">
          <LiveStrip matches={searched} />

          {isDemo && (
            <div className="banner" role="status">
              Viser demodata. {error ? 'Kampene kunne ikke hentes fra API’et.' : 'Demotilstand er slået til.'}
            </div>
          )}

          <div className="grid">
            <Sidebar groups={allGroups} pinned={pinned} />

            <main className="feed">
              <div className="feed__head">
                <h1 className="feed__title">
                  {sportLabel}
                  <span>{formatLong(date)}</span>
                </h1>
                <FilterBar value={filter} onChange={setFilter} counts={counts} />
              </div>
              <DateStrip selected={date} onSelect={setDate} />

              {loading && matches.length === 0 ? (
                <div className="panel">
                  {Array.from({ length: 6 }, (_, i) => (
                    <div key={i} className="skeleton" />
                  ))}
                </div>
              ) : groups.length === 0 ? (
                <div className="panel empty">
                  <p>{query ? `Ingen kampe matcher “${query}”.` : 'Ingen kampe for den valgte dag og filter.'}</p>
                </div>
              ) : (
                <div className={`league-list${loading ? ' is-loading' : ''}`}>
                  {groups.map((g) => (
                    <LeagueSection
                      key={g.leagueId}
                      group={g}
                      pinned={pinned.has(g.leagueId)}
                      onTogglePin={() => togglePin(g.leagueId)}
                    />
                  ))}
                </div>
              )}
            </main>

            <aside className="aside">
              <FeaturedMatch matches={matches} pinned={pinned} />
              <StatTiles matches={matches} updatedAt={updatedAt} isDemo={isDemo} onRefresh={refresh} />
            </aside>
          </div>
        </div>
      </div>
    </div>
  )
}
