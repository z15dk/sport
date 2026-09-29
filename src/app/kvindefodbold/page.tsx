import type { Metadata } from 'next'
import { MatchesView } from '../../components/MatchesView'
import { RealDataExtra } from '../../components/RealDataExtra'
import { externalOn, getMatches, isWomenGame, isWomenMatch, upcomingMatches } from '../../data/matches'
import { JsonLd, breadcrumbLd, matchListLd, webPageLd } from '../../lib/jsonld'
import { SITE_NAME, paths } from '../../lib/site'
import { addDays, formatFull, isoDate, isValidIsoDate } from '../../lib/time'

// Women's football: the front page with only the women's matches (the
// Kvindeliga, A-Liga, Champions League, WSL, Frauen-Bundesliga, Damallsvenskan
// and the other women's tournaments we follow). Another day with ?dato=.

export const dynamic = 'force-dynamic'

type SearchParams = Promise<{ dato?: string; live?: string }>

const womenOn = (date: string, now: number) => getMatches(date, 'soccer', now).filter(isWomenMatch)

/** The nearest day with women's matches before or after a date */
function nearestDay(date: string, direction: 1 | -1, now: number) {
  for (let i = 1; i <= 60; i++) {
    const d = addDays(date, i * direction)
    if (womenOn(d, now).length) return d
  }
  return undefined
}

function dayOf(dato: string | undefined, today: string) {
  // Only days our data can have
  return isValidIsoDate(dato) && Math.abs(Date.parse(dato) - Date.parse(today)) / 86_400_000 <= 400 ? dato : today
}

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const { dato } = await searchParams
  const now = Date.now()
  const today = isoDate(now)
  const date = dayOf(dato, today)
  const count = womenOn(date, now).length
  const other = date !== today
  const when = other ? formatFull(date) : 'i dag'
  return {
    title: other ? `Kvindefodbold ${when} – resultater og kampe` : 'Kvindefodbold i dag – live resultater, kampe og stillinger',
    description: `${count ? `${count} kampe` : 'Kampene'} i kvindefodbold ${when}: Kvindeligaen, A-Ligaen, Champions League, WSL, Frauen-Bundesliga, Damallsvenskan og mere – live stilling, målscorere og tabeller.`,
    alternates: { canonical: paths.women({ dato: date, today }) },
    // Other days are for visitors; the page to find is today's
    ...(other && { robots: { index: false, follow: true } }),
  }
}

export default async function WomenPage({ searchParams }: { searchParams: SearchParams }) {
  const { dato, live } = await searchParams
  const now = Date.now()
  const today = isoDate(now)
  const date = dayOf(dato, today)
  // The browser gets today's games; the page adds the chosen day and tomorrow
  const dates = [...new Set([date, today, addDays(today, 1)])]
  const games = dates.flatMap((d) => externalOn(d)).filter(isWomenGame)
  const upcoming = upcomingMatches('soccer', today, now, 10, 400).filter(isWomenMatch).slice(0, 8)
  const matches = womenOn(date, now)
  return (
    <>
      <JsonLd data={breadcrumbLd([{ name: 'Kvindefodbold', path: paths.women() }])} />
      <JsonLd data={webPageLd(paths.women({ dato: date, today }), `Kvindefodbold · ${SITE_NAME}`, new Date(now), 'Live resultater, kampprogram og stillinger i kvindefodbold.')} />
      {matches.length > 0 && <JsonLd data={matchListLd(`Kvindefodbold ${date === today ? 'i dag' : formatFull(date)}`, matches)} />}
      <RealDataExtra games={games} />
      <MatchesView
        key={live ? 'live' : 'all'}
        women
        sport="soccer"
        heading="Kvindefodbold"
        date={date}
        today={today}
        initialNow={now}
        initialFilter={live ? 'live' : 'all'}
        nearDays={{ prev: nearestDay(date, -1, now), next: nearestDay(date, 1, now) }}
        upcoming={upcoming}
      />
    </>
  )
}
