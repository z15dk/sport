import Link from 'next/link'
import { DIVISIONS } from '../data/danishClubs'
import { INDEXABLE, SITE_NAME, paths } from '../lib/site'

/** Site-wide footer; also gives crawlers a path to every league and key page. */
export function Footer() {
  return (
    <footer className="footer">
      <nav className="footer__cols" aria-label="Sidefod">
        <div>
          <h2>Turneringer</h2>
          <ul>
            {DIVISIONS.map((d) => (
              <li key={d.id}>
                <Link href={paths.league(d.slug)}>{d.name}</Link>
              </li>
            ))}
          </ul>
        </div>
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
    </footer>
  )
}
