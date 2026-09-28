import { MatchesView } from './MatchesView'
import { RealDataExtra } from './RealDataExtra'
import { externalOn, nearestMatchDay, upcomingMatches } from '../data/matches'
import { addDays } from '../lib/time'
import type { SportFilter } from '../types'

/** One day's matches (the front page, and /kampe/<dag>) */
export function DayPage({ sport, date, today, now, live, heading }: { sport: SportFilter; date: string; today: string; now: number; live?: boolean; heading?: string }) {
  // The browser gets today's games; the page adds the chosen day and tomorrow (the match in focus)
  const dates = new Set([date, today, addDays(today, 1)])
  const shown = [...dates].flatMap((d) => externalOn(d))
  const days = { prev: nearestMatchDay(date, sport, -1, now), next: nearestMatchDay(date, sport, 1, now) }
  return (
    <>
      <RealDataExtra games={shown} />
      <MatchesView key={live ? 'live' : 'all'} sport={sport} date={date} today={today} initialNow={now} initialFilter={live ? 'live' : 'all'} nearDays={days} upcoming={upcomingMatches(sport, today, now)} heading={heading} />
    </>
  )
}
