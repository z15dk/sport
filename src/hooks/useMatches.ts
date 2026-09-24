import { useCallback, useEffect, useState } from 'react'
import { fetchEventsByDay } from '../api/thesportsdb'
import { demoMatches } from '../api/demo'
import { SPORTS } from '../sports'
import type { Match, SportId } from '../types'

const REFRESH_MS = 60_000
const forceDemo = new URLSearchParams(window.location.search).has('demo')

interface State {
  /** Request key the state belongs to; loading while it differs from the current one */
  key: string
  matches: Match[]
  error: string | null
  isDemo: boolean
  updatedAt: Date | null
}

/**
 * Loads matches for a day and sport. Falls back to demo data if the API
 * fails, and refreshes periodically while live matches can change.
 */
export function useMatches(date: string, sport: SportId, autoRefresh: boolean) {
  const [state, setState] = useState<State>({ key: '', matches: [], error: null, isDemo: false, updatedAt: null })
  const [tick, setTick] = useState(0)
  const key = `${date}|${sport}|${tick}`

  const refresh = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    const controller = new AbortController()
    const apiName = SPORTS.find((s) => s.id === sport)!.apiName

    const load = forceDemo
      ? Promise.resolve({ matches: demoMatches(date, sport), isDemo: true, error: null })
      : fetchEventsByDay(date, apiName, controller.signal)
          .then((matches) => ({ matches, isDemo: false, error: null }))
          .catch((err: unknown) => {
            if (controller.signal.aborted) throw err
            return {
              matches: demoMatches(date, sport),
              isDemo: true,
              error: err instanceof Error ? err.message : 'Ukendt fejl',
            }
          })

    load
      .then((r) => setState({ ...r, key, updatedAt: new Date() }))
      .catch(() => {
        /* aborted */
      })

    return () => controller.abort()
  }, [date, sport, key])

  useEffect(() => {
    if (!autoRefresh) return
    const id = window.setInterval(refresh, REFRESH_MS)
    return () => window.clearInterval(id)
  }, [autoRefresh, refresh])

  return { ...state, loading: state.key !== key, refresh }
}
