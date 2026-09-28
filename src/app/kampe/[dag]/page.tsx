import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { DayPage } from '../../../components/DayPage'
import { getMatches } from '../../../data/matches'
import { addDays, formatFull, isoDate, isValidIsoDate } from '../../../lib/time'
import { JsonLd, breadcrumbLd } from '../../../lib/jsonld'
import { dayAlias, paths } from '../../../lib/site'
import { sportFilterBySlug } from '../../../sports'

// A day's matches under its own address: /kampe/i-gaar, /kampe/i-morgen and
// /kampe/<yyyy-mm-dd> (today is the front page). Titled for what people search
// for: "Resultater i går", "Kampe i morgen", "Fodbold resultater 27. september".

export const dynamic = 'force-dynamic'

type Params = Promise<{ dag: string }>
type SearchParams = Promise<{ sport?: string; live?: string }>

function resolve(dag: string, now: number) {
  const today = isoDate(now)
  const date = dag === 'i-gaar' ? addDays(today, -1) : dag === 'i-morgen' ? addDays(today, 1) : dag === 'i-dag' ? today : isValidIsoDate(dag) ? dag : undefined
  // Only the dates our data can have: a date years away is not a page (a crawler could walk the day links forever)
  const days = date ? Math.abs(Date.parse(date) - Date.parse(today)) / 86_400_000 : Infinity
  return date && days <= 400 ? { date, today } : undefined
}

function words(date: string, today: string, sportLabel?: string) {
  const when = date === addDays(today, -1) ? 'i går' : date === addDays(today, 1) ? 'i morgen' : formatFull(date)
  const past = date < today
  // One word, as Danish writes it: "Fodboldresultater", "Ishockeykampe"
  const what = sportLabel ? `${sportLabel}${past ? 'resultater' : 'kampe'}` : past ? 'Resultater' : 'Kampe'
  return { when, past, heading: `${what} ${when}` }
}

export async function generateMetadata({ params, searchParams }: { params: Params; searchParams: SearchParams }): Promise<Metadata> {
  const [{ dag }, { sport }] = await Promise.all([params, searchParams])
  const now = Date.now()
  const found = resolve(dag, now)
  if (!found) return { title: 'Siden findes ikke' }
  const s = sportFilterBySlug(sport)
  const { date, today } = found
  const w = words(date, today, s.id === 'all' ? undefined : s.label)
  const count = getMatches(date, s.id, now).length
  const dateText = formatFull(date)
  const alias = dayAlias(date, today)
  return {
    title: `${w.heading}${w.when === dateText ? '' : ` (${dateText})`} – ${w.past ? 'alle resultater' : 'kampprogram og TV'}`,
    description: w.past
      ? `${count ? `Alle ${count} resultater` : 'Resultaterne'} ${w.when}${w.when === dateText ? '' : `, ${dateText}`}: ${s.id === 'all' ? 'fodbold, ishockey, basketball og mere' : s.label.toLowerCase()} fra Danmark og Europas store ligaer, med målscorere og stillinger.`
      : `${count ? `Alle ${count} kampe` : 'Kampene'} ${w.when}${w.when === dateText ? '' : `, ${dateText}`}: kampprogram med tidspunkter og TV-kanaler for ${s.id === 'all' ? 'fodbold, ishockey, basketball og mere' : s.label.toLowerCase()}.`,
    // A day without matches is not worth a place in the search results
    ...(count === 0 && { robots: { index: false, follow: true } }),
    // Yesterday and tomorrow are found under their names; today is the front page
    alternates: { canonical: alias ? `${paths.home({ sport: s.slug, dato: date, today })}` : paths.home({ sport: s.slug }) },
  }
}

export default async function DayRoute({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const [{ dag }, { sport, live }] = await Promise.all([params, searchParams])
  const now = Date.now()
  const found = resolve(dag, now)
  if (!found) notFound()
  const s = sportFilterBySlug(sport)
  const { date, today } = found
  if (dag === 'i-dag') permanentRedirect(paths.home({ sport: s.slug }))
  const w = words(date, today, s.id === 'all' ? undefined : s.label)
  return (
    <>
      <JsonLd data={breadcrumbLd([{ name: 'Kampe', path: '/' }, { name: w.heading, path: `/kampe/${dag}` }])} />
      <DayPage sport={s.id} date={date} today={today} now={now} live={!!live} heading={w.heading} />
    </>
  )
}
