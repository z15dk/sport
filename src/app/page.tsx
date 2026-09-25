import type { Metadata } from 'next'
import { MatchesView } from '../components/MatchesView'
import { formatFull, isoDate, isValidIsoDate } from '../lib/time'
import { paths } from '../lib/site'
import { sportFilterBySlug } from '../sports'

export const dynamic = 'force-dynamic'

type SearchParams = Promise<{ sport?: string; dato?: string }>

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
  const { sport, dato } = await searchParams
  const now = Date.now()
  const today = isoDate(now)
  const date = isValidIsoDate(dato) ? dato : today
  return <MatchesView sport={sportFilterBySlug(sport).id} date={date} today={today} initialNow={now} />
}
