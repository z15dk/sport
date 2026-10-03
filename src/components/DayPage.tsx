import { MatchesView } from './MatchesView'
import { RealDataExtra } from './RealDataExtra'
import { externalOn, nearestMatchDay, upcomingMatches } from '../data/matches'
import { addDays } from '../lib/time'
import { leaguesOn } from '../lib/clientData'
import type { SportFilter } from '../types'

/** One day's matches (the front page, and /kampe/<dag>) */
export function DayPage({ sport, date, today, now, live, heading, frontPage }: { sport: SportFilter; date: string; today: string; now: number; live?: boolean; heading?: string; frontPage?: boolean }) {
  // The browser gets the games in play; the page adds the chosen day, and from today and tomorrow the
  // games the match in focus is picked from (12–24 hours ahead, MatchesView)
  const hour = Math.floor(now / 3_600_000) * 3_600_000
  const focus = [today, addDays(today, 1)].flatMap((d) => (d === date ? [] : externalOn(d))).filter((g) => {
    const t = new Date(g.kickoff).getTime()
    return t >= hour + 11 * 3_600_000 && t <= hour + 25 * 3_600_000
  })
  const shown = [...externalOn(date), ...focus]
  const days = { prev: nearestMatchDay(date, sport, -1, now), next: nearestMatchDay(date, sport, 1, now) }
  return (
    <>
      <RealDataExtra games={shown} leagues={leaguesOn(date)} />
      <MatchesView key={live ? 'live' : 'all'} sport={sport} date={date} today={today} initialNow={now} initialFilter={live ? 'live' : 'all'} nearDays={days} upcoming={upcomingMatches(sport, today, now)} heading={heading} scrollAd={frontPage} />
    </>
  )
}
