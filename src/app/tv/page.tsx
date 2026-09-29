import type { Metadata } from 'next'
import Link from 'next/link'
import { tvLeagues, tvMatches } from '../../lib/tv'
import { TvLeagueLinks, TvMatches } from '../../components/TvGuide'
import { JsonLd, breadcrumbLd, matchListLd, webPageLd } from '../../lib/jsonld'
import { paths } from '../../lib/site'
import { addDays, formatFull, isoDate } from '../../lib/time'

// "Fodbold i TV i dag": today's football on TV with the channels, then the
// other sports; tomorrow's football under it. A search people make every day.

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const now = Date.now()
  const count = tvMatches(1, now, undefined, 'soccer').length
  return {
    title: 'Fodbold i TV i dag – kampe og kanaler',
    description: `${count ? `${count} fodboldkampe` : 'Fodboldkampene'} i TV i dag, ${formatFull(isoDate(now))}: Superliga, Premier League, Champions League og mere med tidspunkt og kanal.`,
    alternates: { canonical: paths.tv() },
    ...(count === 0 && { robots: { index: false, follow: true } }),
  }
}

export default function TvPage() {
  const now = Date.now()
  const today = isoDate(now)
  const all = tvMatches(2, now)
  const todays = all.filter((m) => isoDate(m.kickoff) === today)
  const football = todays.filter((m) => m.sport === 'soccer')
  const other = todays.filter((m) => m.sport !== 'soccer')
  const tomorrow = all.filter((m) => isoDate(m.kickoff) === addDays(today, 1) && m.sport === 'soccer')
  const title = 'Fodbold i TV i dag'
  return (
    <div className="page">
      <JsonLd data={breadcrumbLd([{ name: 'Forside', path: '/' }, { name: title, path: paths.tv() }])} />
      <JsonLd data={webPageLd(paths.tv(), title, new Date(now))} />
      <JsonLd data={matchListLd(`${title} – ${formatFull(today)}`, football)} />
      <div className="clubs">
        <div className="clubs__head">
          <h1 className="feed__title">{title}</h1>
          <p className="lead">
            Dagens fodboldkampe i TV, {formatFull(today)}, med tidspunkt og kanal. Tryk på en kamp for live-stilling, opstillinger og statistik.
          </p>
        </div>
        <TvMatches matches={football} empty="Vi kender ikke til fodbold i TV i dag." />
        {other.length > 0 && (
          <>
            <h2 className="feed__title">Anden sport i TV i dag</h2>
            <TvMatches matches={other} empty="" />
          </>
        )}
        <h2 className="feed__title">Fodbold i TV i morgen</h2>
        <TvMatches matches={tomorrow} empty="Vi kender endnu ikke til fodbold i TV i morgen." />
        <TvLeagueLinks leagues={tvLeagues()} />
        <p className="muted small">
          Kanalerne kommer fra TV-programmer og rettighedsaftaler og kan ændre sig. Se også <Link href={paths.home({ dato: addDays(today, 1), today })}>alle kampe i morgen</Link>.
        </p>
      </div>
    </div>
  )
}
