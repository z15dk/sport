import Link from 'next/link'
import type { Match } from '../types'
import { paths } from '../lib/site'
import { byLeague, type TvLeague } from '../lib/tv'
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


/** "Hvor vises ligaerne?": every league with its usual channel and a link to its TV page */
export function TvLeagueChannels({ leagues }: { leagues: (TvLeague & { channel?: string })[] }) {
  return (
    <section className="panel">
      <h2 className="panel__title">Hvor vises ligaerne?</h2>
      <ul className="tv-leagues">
        {leagues.map((l) => (
          <li key={l.slug}>
            <Link href={paths.tv(l.slug)}>{l.name} i TV</Link>
            {l.channel && <span className="muted">{l.channel}</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}
