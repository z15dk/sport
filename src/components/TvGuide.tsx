import Link from 'next/link'
import type { Match } from '../types'
import { paths } from '../lib/site'
import { TV_PERIODS, byDay, byLeague, tvDayName, type TvLeague, type TvPeriod } from '../lib/tv'
import { MatchRow } from './MatchRow'

/** The TV guide's matches: by tournament, with the channel on each row (MatchRow shows it) */
export function TvMatches({ matches, showDate, empty }: { matches: Match[]; showDate?: boolean; empty: string }) {
  if (!matches.length) return <p className="muted pad">{empty}</p>
  return (
    <>
      {byLeague(matches).map((g) => (
        <section key={g.league} className="league">
          <header className="league__header">
            <div className="league__toggle">
              <span className="league__titles">
                <h2 className="league__name">{g.slug ? <Link href={paths.league(g.slug)}>{g.league}</Link> : g.league}</h2>
              </span>
              <span className="league__count">{g.matches.length} i TV</span>
            </div>
          </header>
          <ul className="league__matches">
            {g.matches.map((m) => (
              <MatchRow key={m.id} match={m} showDate={showDate} />
            ))}
          </ul>
        </section>
      ))}
    </>
  )
}

/** Links to every league's TV page */
export function TvLeagueLinks({ leagues, current }: { leagues: TvLeague[]; current?: string }) {
  return (
    <section className="panel">
      <h2 className="panel__title">TV-oversigt pr. turnering</h2>
      <p className="tv-links">
        <Link className={`pill${current ? '' : ' is-active'}`} href={paths.tv()}>
          I dag
        </Link>
        {leagues.map((l) => (
          <Link key={l.slug} className={`pill${current === l.slug ? ' is-active' : ''}`} href={paths.tv(l.slug)}>
            {l.name}
          </Link>
        ))}
      </p>
    </section>
  )
}


/** "Hvor vises ligaerne?": every league with its usual channel (those with one first), each a link to the league's TV page */
export function TvLeagueChannels({ leagues }: { leagues: (TvLeague & { channel?: string })[] }) {
  const sorted = [...leagues.filter((l) => l.channel), ...leagues.filter((l) => !l.channel)]
  return (
    <section className="panel">
      <h2 className="panel__title">Hvor vises ligaerne?</h2>
      <ul className="tv-leagues">
        {sorted.map((l) => (
          <li key={l.slug}>
            <Link href={paths.tv(l.slug)}>
              <span className="tv-leagues__name">
                {l.name}
                <span className="visually-hidden"> i TV</span>
              </span>
              {l.channel && <span className="tv-leagues__channel">{l.channel}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Today, tomorrow and the weekend: the guide's pages by day */
export function TvDayNav({ current }: { current?: TvPeriod }) {
  return (
    <nav className="filter-bar tv-daynav" aria-label="Fodbold i TV: dage">
      <Link className={`pill${current ? '' : ' is-active'}`} href={paths.tv()} aria-current={current ? undefined : 'page'}>
        I dag
      </Link>
      {(Object.keys(TV_PERIODS) as TvPeriod[]).map((p) => (
        <Link key={p} className={`pill${current === p ? ' is-active' : ''}`} href={paths.tv(p)} aria-current={current === p ? 'page' : undefined}>
          {p === 'i-morgen' ? 'I morgen' : 'Weekenden'}
        </Link>
      ))}
    </nav>
  )
}

/** The football on TV day by day, each day under its own heading ("Fodbold i TV fredag 9. oktober") */
export function TvDays({ matches, today }: { matches: Match[]; today: string }) {
  return (
    <>
      {byDay(matches).map((d) => (
        <section key={d.date} className="tv-day-block">
          <h2 className="tv-day">
            Fodbold i TV {tvDayName(d.date, today)} <span>{d.matches.length} i TV</span>
          </h2>
          <TvMatches matches={d.matches} empty="" />
        </section>
      ))}
    </>
  )
}
