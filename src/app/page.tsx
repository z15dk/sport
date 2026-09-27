import type { Metadata } from 'next'
import { MatchesView } from '../components/MatchesView'
import { RealDataExtra } from '../components/RealDataExtra'
import { externalOn, nearestMatchDay, upcomingMatches } from '../data/matches'
import { addDays, formatFull, isoDate, isValidIsoDate } from '../lib/time'
import { paths } from '../lib/site'
import { sportFilterBySlug } from '../sports'

export const dynamic = 'force-dynamic'

type SearchParams = Promise<{ sport?: string; dato?: string; live?: string }>

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const { sport, dato } = await searchParams
  const s = sportFilterBySlug(sport)
  const date = isValidIsoDate(dato) ? dato : undefined
  return {
    title: date ? `${s.label} ${formatFull(date)} – resultater og kampe` : s.id === 'all' ? 'Live resultater og dagens kampe' : `${s.label} i dag – live resultater og kampe`,
    alternates: { canonical: paths.home({ sport: s.slug, dato: date }) },
  }
}

export default async function Home({ searchParams }: { searchParams: SearchParams }) {
  const { sport, dato, live } = await searchParams
  const now = Date.now()
  const today = isoDate(now)
  const date = isValidIsoDate(dato) ? dato : today
  const sportId = sportFilterBySlug(sport).id
  // The browser gets today's games; the page adds the chosen day and tomorrow (the match in focus)
  const dates = new Set([date, today, addDays(today, 1)])
  const shown = [...dates].flatMap((d) => externalOn(d))
  const days = { prev: nearestMatchDay(date, sportId, -1, now), next: nearestMatchDay(date, sportId, 1, now) }
  return (
    <>
      <RealDataExtra games={shown} />
      <MatchesView key={live ? 'live' : 'all'} sport={sportId} date={date} today={today} initialNow={now} initialFilter={live ? 'live' : 'all'} nearDays={days} upcoming={upcomingMatches(sportId, today, now)} />
    </>
  )
}
