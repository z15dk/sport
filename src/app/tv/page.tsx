import type { Metadata } from 'next'
import Link from 'next/link'
import type { Match } from '../../types'
import { byDay, leagueChannels, tvMatches } from '../../lib/tv'
import { channelsFor } from '../../data/channels'
import { TvLeagueChannels, TvMatches } from '../../components/TvGuide'
import { JsonLd, breadcrumbLd, matchListLd, webPageLd } from '../../lib/jsonld'
import { paths } from '../../lib/site'
import { addDays, formatFull, formatLong, formatTime, isoDate } from '../../lib/time'

// "Fodbold i TV i dag": today's football on TV with the channels, then the
// other sports, and the football of the coming week day by day – so the page
// has matches (and the next one named) also on a day without football on TV.
// A search people make every day.

export const dynamic = 'force-dynamic'

/** Today and the six days after */
const DAYS = 7

/** "i morgen" or "fredag 9. oktober" */
const dayName = (date: string, today: string) => (date === addDays(today, 1) ? 'i morgen' : formatLong(date))

const kampe = (n: number) => `${n} ${n === 1 ? 'fodboldkamp' : 'fodboldkampe'}`

function football(now: number) {
  const today = isoDate(now)
  const week = tvMatches(DAYS, now)
  const all = week.filter((m) => m.sport === 'soccer')
  return { today, week, all, todays: all.filter((m) => isoDate(m.kickoff) === today), coming: all.filter((m) => isoDate(m.kickoff) !== today) }
}

/** "FC Nordsjælland – OB fredag 9. oktober kl. 19.00 på TV 2 Sport" */
const nextText = (m: Match, today: string) =>
  `${m.home.name} – ${m.away.name} ${dayName(isoDate(m.kickoff), today)} kl. ${formatTime(m.kickoff)} på ${channelsFor(m)
    .map((c) => c.name)
    .join(' og ')}`

export async function generateMetadata(): Promise<Metadata> {
  const { today, all, todays, coming } = football(Date.now())
  return {
    title: 'Fodbold i TV i dag – kampe og kanaler',
    description: todays.length
      ? `${kampe(todays.length)} i TV i dag, ${formatFull(today)}: Superliga, Premier League, Champions League og mere med tidspunkt og kanal.`
      : `Fodbold i TV i dag og de kommende dage med tidspunkt og kanal.${coming[0] ? ` Næste kamp i TV: ${nextText(coming[0], today)}.` : ''}`,
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
            {todays.length ? `${kampe(todays.length)} i TV i dag` : 'Fodbold i TV i dag'}, {formatLong(today)}, med tidspunkt og kanal – og de kommende dages kampe
            herunder. Tryk på en kamp for live-stilling, opstillinger og statistik.
          </p>
        </div>
        {todays.length > 0 ? (
          <TvMatches matches={todays} empty="" />
        ) : (
          <p className="panel tv-next">
            <strong>Ingen fodbold i TV i dag.</strong>{' '}
            {next ? (
              <>
                Næste kamp i TV er <Link href={paths.match(next.slug)}>{nextText(next, today)}</Link>.
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
        {byDay(coming).map((d) => (
          <section key={d.date} className="tv-day-block">
            <h2 className="tv-day">
              Fodbold i TV {dayName(d.date, today)} <span>{d.matches.length} i TV</span>
            </h2>
            <TvMatches matches={d.matches} empty="" />
          </section>
        ))}
        <TvLeagueChannels leagues={leagueChannels(week)} />
        <p className="muted small">
          Kanalerne kommer fra TV-programmer og rettighedsaftaler og kan ændre sig. Se også <Link href={paths.home({ dato: addDays(today, 1), today })}>alle kampe i morgen</Link>.
        </p>
      </div>
    </div>
  )
}
