import { useEffect, useMemo, useState } from 'react'
import { Header } from './components/Header'
import { SportTabs } from './components/SportTabs'
import { DateStrip } from './components/DateStrip'
import { FilterBar } from './components/FilterBar'
import { LeagueSection } from './components/LeagueSection'
import { Sidebar } from './components/Sidebar'
import { SummaryPanel } from './components/SummaryPanel'
import { useMatches } from './hooks/useMatches'
import { usePersistentState } from './hooks/usePersistentState'
import { isSameDay, toIsoDate } from './dates'
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
  const [theme, setTheme] = usePersistentState<'light' | 'dark'>(
    'theme',
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  )
  const [pinnedList, setPinnedList] = usePersistentState<string[]>('pinnedLeagues', [])
  const [sport, setSport] = useState<SportId>('soccer')
  const [date, setDate] = useState(() => new Date())
  const [filter, setFilter] = useState<StateFilter>('all')
  const [query, setQuery] = useState('')

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

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

  return (
    <>
      <Header
        query={query}
        onQueryChange={setQuery}
        theme={theme}
        onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      />
      <SportTabs value={sport} onChange={setSport} />

      <div className="layout">
        <Sidebar groups={allGroups} pinned={pinned} />

        <main className="feed">
          <div className="card feed__controls">
            <DateStrip selected={date} onSelect={setDate} />
            <FilterBar value={filter} onChange={setFilter} counts={counts} />
          </div>

          {isDemo && (
            <div className="banner" role="status">
              Viser demodata – {error ? 'API’et kunne ikke nås.' : 'demotilstand er slået til.'}
            </div>
          )}

          {loading && matches.length === 0 ? (
            <div className="card">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="skeleton" />
              ))}
            </div>
          ) : groups.length === 0 ? (
            <div className="card empty">
              <p className="empty__icon" aria-hidden>
                📭
              </p>
              <p>{query ? `Ingen kampe matcher “${query}”.` : 'Ingen kampe for den valgte dag og filter.'}</p>
            </div>
          ) : (
            <div className={`card league-list${loading ? ' is-loading' : ''}`}>
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

        <SummaryPanel
          date={date}
          matches={matches}
          updatedAt={updatedAt}
          isDemo={isDemo}
          error={error}
          onRefresh={refresh}
        />
      </div>
    </>
  )
}
