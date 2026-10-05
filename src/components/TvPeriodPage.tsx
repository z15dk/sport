import type { Metadata } from 'next'
import Link from 'next/link'
import { TV_DAYS, TV_PERIODS, footballCount, leagueChannels, periodDates, tvMatchText, tvMatches, type TvPeriod } from '../lib/tv'
import { TvDayNav, TvDays, TvLeagueChannels, TvMatches } from './TvGuide'
import { JsonLd, breadcrumbLd, matchListLd, webPageLd } from '../lib/jsonld'
import { paths } from '../lib/site'
import { formatDayMonth, formatLong, isoDate } from '../lib/time'

// "Fodbold i TV i morgen" (/tv/i-morgen) and "Fodbold i TV i weekenden"
// (/tv/weekenden): the same guide as /tv for the days people also search for.

function period(p: TvPeriod, now: number) {
  const today = isoDate(now)
  const dates = periodDates(p, today)
  const week = tvMatches(TV_DAYS, now)
  const inPeriod = week.filter((m) => dates.includes(isoDate(m.kickoff)))
  return {
    today,
    week,
    football: inPeriod.filter((m) => m.sport === 'soccer'),
    other: inPeriod.filter((m) => m.sport !== 'soccer'),
    // "tirsdag 6. oktober" or "9. okt.–11. okt."
    when: dates.length === 1 ? formatLong(dates[0]) : `${formatDayMonth(dates[0])}–${formatDayMonth(dates[dates.length - 1])}`,
  }
}

export function tvPeriodMetadata(p: TvPeriod): Metadata {
  const { today, football, when } = period(p, Date.now())
  const name = TV_PERIODS[p]
  return {
    title: `Fodbold i TV ${name}, ${when} – kampe og kanaler`,
    description: football.length
      ? `${footballCount(football.length)} i TV ${name}, ${when}, med tidspunkt og kanal. Første kamp: ${tvMatchText(football[0], today)}.`
      : `Fodbold i TV ${name}, ${when}, med tidspunkt og kanal.`,
    alternates: { canonical: paths.tv(p) },
    ...(football.length === 0 && { robots: { index: false, follow: true } }),
  }
}

export function TvPeriodPage({ period: p }: { period: TvPeriod }) {
  const now = Date.now()
  const { today, week, football, other, when } = period(p, now)
  const name = TV_PERIODS[p]
  const title = `Fodbold i TV ${name}`
  return (
    <div className="page">
      <JsonLd
        data={breadcrumbLd([
          { name: 'Forside', path: '/' },
          { name: 'Fodbold i TV', path: paths.tv() },
          { name: title, path: paths.tv(p) },
        ])}
      />
      <JsonLd data={webPageLd(paths.tv(p), title, new Date(now))} />
      <JsonLd data={matchListLd(`${title} – ${when}`, football)} />
      <div className="clubs tv-page">
        <div className="clubs__head">
          <h1 className="feed__title">{title}</h1>
          <p className="lead">
            {football.length ? `${footballCount(football.length)} i TV ${name}` : `Fodbold i TV ${name}`}, {when}, med tidspunkt og kanal. Tryk på en kamp for
            live-stilling, opstillinger og statistik.
          </p>
        </div>
        <TvDayNav current={p} />
        {football.length > 0 ? (
          <TvDays matches={football} today={today} />
        ) : (
          <p className="panel tv-next">
            <strong>Vi kender endnu ikke til fodbold i TV {name}.</strong> Se <Link href={paths.tv()}>fodbold i TV i dag og de kommende dage</Link>.
          </p>
        )}
        {other.length > 0 && (
          <>
            <h2 className="tv-day">Anden sport i TV {name}</h2>
            <TvMatches matches={other} showDate={p === 'weekenden'} empty="" />
          </>
        )}
        <TvLeagueChannels leagues={leagueChannels(week)} />
        <p className="muted small">Kanalerne kommer fra TV-programmer og rettighedsaftaler og kan ændre sig.</p>
      </div>
    </div>
  )
}
