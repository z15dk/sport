import Link from 'next/link'
import { shownDivisions, sportOf } from '../data/leagues'
import { SITE_NAME, paths, SOCIAL_PROFILES } from '../lib/site'
import { indexable } from '../lib/settings'
import { RESPONSIBLE_GAMBLING } from '../data/partners'
import { sportById } from '../sports'
import { Flag } from './Flag'
import { getRealData } from '../data/real'
import { divisionOfGame } from '../data/ourLeagues'
import { danishCountry } from '../data/countries'
import { externalLeagueKey } from '../data/external'
import type { SportId } from '../types'
import { ConsentSettingsLink } from './ConsentBanner'
import { trackingConfig } from '../lib/tracking'

type Other = { key: string; name: string; sport: SportId; country?: string }
// Worked out once per data (every page has the footer, and the data has thousands of games)
const othersCache = new WeakMap<object, Map<string, Other>>()
function otherLeagues(): Map<string, Other> {
  const data = getRealData()
  const have = data && othersCache.get(data)
  if (have) return have
  const others = new Map<string, Other>()
  for (const g of data?.external ?? []) {
    if (divisionOfGame(g)) continue
    const key = externalLeagueKey(g.league)
    if (!others.has(key)) others.set(key, { key, name: g.league.name, sport: g.sport, country: g.league.country })
  }
  if (data) othersCache.set(data, others)
  return others
}

/** Site-wide footer: one compact band – the site's pages, our leagues by sport, every other tournament folded away (still a path for crawlers), and the small print. */
export function Footer() {
  const divisions = shownDivisions()
  const tracking = trackingConfig()
  const hasTracking = !!(tracking.ga || tracking.metaPixel)
  // Every other league and cup we fetch from API-Sports (the admin's choice and the built-in list), once each
  const others = [...otherLeagues().values()]
  const sports = [...new Set(divisions.map(sportOf))]
  const byCountry = (a: { country?: string; name: string }, b: { country?: string; name: string }) =>
    danishCountry(a.country).localeCompare(danishCountry(b.country), 'da') || a.name.localeCompare(b.name, 'da')
  const otherSports = [...new Set(others.map((o) => o.sport))]
  const year = new Date().getFullYear()
  return (
    <footer className="footer">
      <div className="footer__in">
        <div className="footer__top">
          <Link className="logo footer__logo" href="/" aria-label="Matchly – til forsiden">
            Matchly<span className="logo__dot">.</span>
          </Link>
          <nav className="footer__links" aria-label="Sidens sider">
            <Link href="/">Dagens kampe</Link>
            <Link href="/kampe/i-gaar">I går</Link>
            <Link href="/kampe/i-morgen">I morgen</Link>
            <Link href={paths.tv()}>Fodbold i TV</Link>
            <Link href={paths.women()}>Kvindesport</Link>
            <Link href={paths.clubs()}>Klubber</Link>
            <Link href={paths.articles()}>Artikler</Link>
            <Link href="/widget">Tabel til din side</Link>
            <Link href={paths.advertising()}>Annoncering</Link>
            <Link href={paths.about()}>Om {SITE_NAME}</Link>
            <Link href={paths.privacy()}>Privatliv</Link>
            {hasTracking && <ConsentSettingsLink />}
          </nav>
        </div>

        <nav className="footer__leagues" aria-label="Vores ligaer">
          {sports.map((sport) => (
            <div key={sport} className="footer__row">
              <span className="footer__sport">{sportById(sport).label}</span>
              <ul>
                {divisions
                  .filter((d) => sportOf(d) === sport)
                  .map((d) => (
                    <li key={d.id}>
                      <Link href={paths.league(d.slug)}>
                        <Flag country={d.country} /> {d.name}
                      </Link>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </nav>

        {others.length > 0 && (
          <details className="footer__more">
            <summary>Alle turneringer, vi følger ({others.length})</summary>
            {otherSports.map((sport) => (
              <div key={sport} className="footer__row">
                <span className="footer__sport">{sportById(sport).label}</span>
                <ul>
                  {others
                    .filter((o) => o.sport === sport)
                    .sort(byCountry)
                    .map((o) => (
                      <li key={o.key}>
                        <Link href={paths.league(o.key)}>
                          <Flag country={danishCountry(o.country)} /> {o.name}
                        </Link>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </details>
        )}

        <p className="footer__bottom">
          <span>© {year} {SITE_NAME} · Live score og stats</span>
          <span>
            Odds vises for spillere over 18 år ·{' '}
            <a href={RESPONSIBLE_GAMBLING.url} target="_blank" rel="noopener">
              {RESPONSIBLE_GAMBLING.text}
            </a>
          </span>
          <a className="footer__social" href={SOCIAL_PROFILES.facebook} target="_blank" rel="noopener noreferrer">
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
              <path fill="currentColor" d="M13.5 22v-8h2.7l.4-3.2h-3.1V8.8c0-.9.3-1.6 1.6-1.6h1.7V4.4c-.3 0-1.3-.1-2.5-.1-2.5 0-4.1 1.5-4.1 4.2v2.3H7.4V14h2.8v8h3.3Z" />
            </svg>
            Følg {SITE_NAME} på Facebook
          </a>
          {!indexable() && <span>Under udvikling</span>}
        </p>
      </div>
    </footer>
  )
}
