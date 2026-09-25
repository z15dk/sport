import Link from 'next/link'
import { leagueGroups } from '../data/leagues'
import { sportById } from '../sports'
import { INDEXABLE, SITE_NAME, paths } from '../lib/site'
import { RESPONSIBLE_GAMBLING } from '../data/partners'

/** Site-wide footer; also gives crawlers a path to every league and key page. */
export function Footer() {
  return (
    <footer className="footer">
      <nav className="footer__cols" aria-label="Sidefod">
        {leagueGroups().map((g) => (
          <div key={`${g.sport}-${g.country}`}>
            <h2>
              {sportById(g.sport).label} · {g.country}
            </h2>
            <ul>
              {g.divisions.map((d) => (
                <li key={d.id}>
                  <Link href={paths.league(d.slug)}>{d.name}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
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
      {!INDEXABLE && <p className="footer__note">Under udvikling – alle resultater er fiktive.</p>}
      <p className="footer__note">
        Odds vises for spillere over 18 år.{' '}
        <a href={RESPONSIBLE_GAMBLING.url} target="_blank" rel="noopener">
          {RESPONSIBLE_GAMBLING.text}
        </a>
      </p>
    </footer>
  )
}
