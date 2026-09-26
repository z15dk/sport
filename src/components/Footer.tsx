import Link from 'next/link'
import { shownDivisions, sportOf } from '../data/leagues'
import { INDEXABLE, SITE_NAME, paths } from '../lib/site'
import { RESPONSIBLE_GAMBLING } from '../data/partners'
import { sportById } from '../sports'
import { Flag } from './Flag'
import { getRealData } from '../data/real'
import { cupOfGame } from '../data/cups'
import { externalLeagueKey } from '../data/external'
import type { SportId } from '../types'

/** Site-wide footer; one column per sport, and a path for crawlers to every league. */
export function Footer() {
  const divisions = shownDivisions()
  const sports = [...new Set(divisions.map(sportOf))]
  // The cups we follow, once their games have come (src/data/cups.ts)
  const cups = new Map<string, { key: string; name: string; sport: SportId; country?: string }>()
  for (const g of getRealData()?.external ?? []) {
    if (!cupOfGame(g)) continue
    const key = externalLeagueKey(g.league)
    if (!cups.has(key)) cups.set(key, { key, name: g.league.name, sport: g.sport, country: g.league.country })
  }
  return (
    <footer className="footer">
      <nav className="footer__cols" aria-label="Sidefod">
        {sports.map((sport) => {
          const leagues = divisions.filter((d) => sportOf(d) === sport)
          return (
            <div key={sport} className={leagues.length > 6 ? 'footer__col--wide' : undefined}>
              <h2>{sportById(sport).label}</h2>
              <ul>
                {leagues.map((d) => (
                  <li key={d.id}>
                    <Link href={paths.league(d.slug)}>
                      <Flag country={d.country} /> {d.name}
                    </Link>
                  </li>
                ))}
                {[...cups.values()]
                  .filter((c) => c.sport === sport)
                  .map((c) => (
                    <li key={c.key}>
                      <Link href={paths.league(c.key)}>
                        <Flag country={c.country} /> {c.name}
                      </Link>
                    </li>
                  ))}
              </ul>
            </div>
          )
        })}
        <div>
          <h2>{SITE_NAME}</h2>
          <ul>
            <li>
              <Link href="/">Dagens kampe</Link>
            </li>
            <li>
              <Link href={paths.clubs()}>Alle klubber</Link>
            </li>
            <li>
              <Link href={paths.about()}>Om {SITE_NAME}</Link>
            </li>
          </ul>
        </div>
      </nav>
      {!INDEXABLE && <p className="footer__note">Under udvikling.</p>}
      <p className="footer__note">
        Odds vises for spillere over 18 år.{' '}
        <a href={RESPONSIBLE_GAMBLING.url} target="_blank" rel="noopener">
          {RESPONSIBLE_GAMBLING.text}
        </a>
      </p>
    </footer>
  )
}
