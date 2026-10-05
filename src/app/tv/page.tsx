import type { Metadata } from 'next'
import Link from 'next/link'
import { TV_DAYS, footballCount, leagueChannels, tvMatchText, tvMatches } from '../../lib/tv'
import { TvDayNav, TvDays, TvLeagueChannels, TvMatches } from '../../components/TvGuide'
import { JsonLd, breadcrumbLd, matchListLd, webPageLd } from '../../lib/jsonld'
import { paths } from '../../lib/site'
import { addDays, formatFull, formatLong, isoDate } from '../../lib/time'

// "Fodbold i TV i dag": today's football on TV with the channels, then the
// other sports, and the football of the coming week day by day – so the page
// has matches (and the next one named) also on a day without football on TV.
// A search people make every day; tomorrow and the weekend have their own
// pages (/tv/i-morgen, /tv/weekenden).

export const dynamic = 'force-dynamic'

function football(now: number) {
  const today = isoDate(now)
  const week = tvMatches(TV_DAYS, now)
  const all = week.filter((m) => m.sport === 'soccer')
  return { today, week, all, todays: all.filter((m) => isoDate(m.kickoff) === today), coming: all.filter((m) => isoDate(m.kickoff) !== today) }
}

export async function generateMetadata(): Promise<Metadata> {
  const { today, all, todays, coming } = football(Date.now())
  return {
    // The date in the title: the search is about today
    title: `Fodbold i TV i dag, ${formatLong(today)} – kampe og kanaler`,
    description: todays.length
      ? `${footballCount(todays.length)} i TV i dag, ${formatFull(today)}: Superliga, Premier League, Champions League og mere med tidspunkt og kanal.`
      : `Fodbold i TV i dag og de kommende dage med tidspunkt og kanal.${coming[0] ? ` Næste kamp i TV: ${tvMatchText(coming[0], today)}.` : ''}`,
    alternates: { canonical: paths.tv() },
    // Only a week without a single match on TV leaves the page empty
    ...(all.length === 0 && { robots: { index: false, follow: true } }),
  }
}

export default function TvPage() {
  const now = Date.now()
  const { today, week, todays, coming } = football(now)
  const other = week.filter((m) => m.sport !== 'soccer' && isoDate(m.kickoff) === today)
  const next = coming[0]
  const title = 'Fodbold i TV i dag'
  return (
    <div className="page">
      <JsonLd data={breadcrumbLd([{ name: 'Forside', path: '/' }, { name: title, path: paths.tv() }])} />
      <JsonLd data={webPageLd(paths.tv(), title, new Date(now))} />
      <JsonLd data={todays.length ? matchListLd(`${title} – ${formatFull(today)}`, todays) : matchListLd('Fodbold i TV de kommende dage', coming.slice(0, 30))} />
      <div className="clubs tv-page">
        <div className="clubs__head">
          <h1 className="feed__title">{title}</h1>
          <p className="lead">
            {todays.length ? `${footballCount(todays.length)} i TV i dag` : 'Fodbold i TV i dag'}, {formatLong(today)}, med tidspunkt og kanal – og de kommende dages kampe
            herunder. Tryk på en kamp for live-stilling, opstillinger og statistik.
          </p>
        </div>
        <TvDayNav />
        {todays.length > 0 ? (
          <TvMatches matches={todays} empty="" />
        ) : (
          <p className="panel tv-next">
            <strong>Ingen fodbold i TV i dag.</strong>{' '}
            {next ? (
              <>
                Næste kamp i TV er <Link href={paths.match(next.slug)}>{tvMatchText(next, today)}</Link>.
              </>
            ) : (
              'Vi kender endnu ikke til fodbold i TV de kommende dage.'
            )}
          </p>
        )}
        {other.length > 0 && (
          <>
            <h2 className="tv-day">Anden sport i TV i dag</h2>
            <TvMatches matches={other} empty="" />
          </>
        )}
        <TvDays matches={coming} today={today} />
        <TvLeagueChannels leagues={leagueChannels(week)} />
        <p className="muted small">
          Kanalerne kommer fra TV-programmer og rettighedsaftaler og kan ændre sig. Se også <Link href={paths.home({ dato: addDays(today, 1), today })}>alle kampe i morgen</Link>.
        </p>
      </div>
    </div>
  )
}
