import Link from 'next/link'
import { shownDivisions, sportOf } from '../data/leagues'
import { SITE_NAME, paths } from '../lib/site'
import { indexable } from '../lib/settings'
import { RESPONSIBLE_GAMBLING } from '../data/partners'
import { sportById } from '../sports'
import { Flag } from './Flag'
import { getRealData } from '../data/real'
import { divisionOfGame } from '../data/ourLeagues'
import { danishCountry } from '../data/countries'
import { externalLeagueKey } from '../data/external'
import type { SportId } from '../types'

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

/** Site-wide footer; one column per sport, and a path for crawlers to every league. */
export function Footer() {
  const divisions = shownDivisions()
  // Every other league and cup we fetch from API-Sports (the admin's choice and the built-in list), once each
  const others = otherLeagues()
  const sports = [...new Set([...divisions.map(sportOf), ...[...others.values()].map((o) => o.sport)])]
  const byCountry = (a: { country?: string; name: string }, b: { country?: string; name: string }) =>
    danishCountry(a.country).localeCompare(danishCountry(b.country), 'da') || a.name.localeCompare(b.name, 'da')
  return (
    <footer className="footer">
      {/* The logo as in the top bar, in white */}
      <Link className="logo footer__logo" href="/" aria-label="Matchly – til forsiden">
        Matchly<span className="logo__dot">.</span>
      </Link>
      <nav className="footer__cols" aria-label="Sidefod">
        {sports.map((sport) => {
          const leagues = divisions.filter((d) => sportOf(d) === sport)
          const more = [...others.values()].filter((o) => o.sport === sport).sort(byCountry)
          const count = leagues.length + more.length
          return (
            <div key={sport} className={count > 14 ? 'footer__col--wide footer__col--wider' : count > 6 ? 'footer__col--wide' : undefined}>
              <h2>{sportById(sport).label}</h2>
              <ul>
                {leagues.map((d) => (
                  <li key={d.id}>
                    <Link href={paths.league(d.slug)}>
                      <Flag country={d.country} /> {d.name}
                    </Link>
                  </li>
                ))}
                {more.map((o) => (
                  <li key={o.key}>
                    <Link href={paths.league(o.key)}>
                      <Flag country={danishCountry(o.country)} /> {o.name}
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
              <Link href="/kampe/i-gaar">Resultater i går</Link>
            </li>
            <li>
              <Link href="/kampe/i-morgen">Kampe i morgen</Link>
            </li>
            <li>
              <Link href={paths.tv()}>Fodbold i TV i dag</Link>
            </li>
            <li>
              <Link href={paths.women()}>Kvindesport</Link>
            </li>
            <li>
              <Link href={paths.women({ sport: 'soccer' })}>Kvindefodbold</Link>
            </li>
            <li>
              <Link href={paths.clubs()}>Alle klubber</Link>
            </li>
            <li>
              <Link href={paths.articles()}>Artikler</Link>
            </li>
            <li>
              <Link href="/widget">Ligatabel til din side</Link>
            </li>
            <li>
              <Link href={paths.about()}>Om {SITE_NAME}</Link>
            </li>
            <li>
              <Link href={paths.privacy()}>Privatliv og cookies</Link>
            </li>
          </ul>
        </div>
      </nav>
      {!indexable() && <p className="footer__note">Under udvikling.</p>}
      <p className="footer__note">
        Odds vises for spillere over 18 år.{' '}
        <a href={RESPONSIBLE_GAMBLING.url} target="_blank" rel="noopener">
          {RESPONSIBLE_GAMBLING.text}
        </a>
      </p>
    </footer>
  )
}
