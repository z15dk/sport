import type { Metadata } from 'next'
import { permanentRedirect } from 'next/navigation'
import { DayPage } from '../components/DayPage'
import { isoDate, isValidIsoDate } from '../lib/time'
import { SITE_NAME, paths } from '../lib/site'
import { sportFilterBySlug } from '../sports'

export const dynamic = 'force-dynamic'

type SearchParams = Promise<{ sport?: string; dato?: string; live?: string }>

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const { sport } = await searchParams
  const s = sportFilterBySlug(sport)
  return {
    title: s.id === 'all' ? { absolute: `${SITE_NAME} – live resultater, kampprogram og stillinger` } : `${s.label} i dag – live resultater og kampe`,
    alternates: { canonical: paths.home({ sport: s.slug }) },
  }
}

export default async function Home({ searchParams }: { searchParams: SearchParams }) {
  const { sport, dato, live } = await searchParams
  const now = Date.now()
  const today = isoDate(now)
  const s = sportFilterBySlug(sport)
  // Other days have their own address (/kampe/i-gaar, /kampe/2026-10-04)
  if (isValidIsoDate(dato) && dato !== today) permanentRedirect(paths.home({ sport: s.slug, dato, today }))
  return <DayPage sport={s.id} date={today} today={today} now={now} live={!!live} frontPage />
}
