import Link from 'next/link'
import { shownDivisions, sportOf } from '../data/leagues'
import { SITE_NAME, paths, SOCIAL_PROFILES } from '../lib/site'
import { indexable } from '../lib/settings'
import { RESPONSIBLE_GAMBLING } from '../data/partners'
import { sportById } from '../sports'
import { Flag, hasFlag } from './Flag'
import { flagCode } from '../data/flagCodes'
import { flagImage } from '../lib/imageSize'
import { getRealData } from '../data/real'
import { divisionOfGame } from '../data/ourLeagues'
import { danishCountry, isInternational } from '../data/countries'
import { externalLeagueKey } from '../data/external'
import type { SportId } from '../types'
import { ConsentSettingsLink } from './ConsentBanner'
import { trackingConfig } from '../lib/tracking'

type Other = { key: string; name: string; sport: SportId; country?: string }
/** A sport's other tournaments, country by country: Denmark first, then the international ones, then the countries by their Danish names */
type OtherSport = { sport: SportId; count: number; countries: { country?: string; name: string; leagues: Other[] }[] }
// Worked out once per data (every page has the footer, and the data has thousands of games)
const othersCache = new WeakMap<object, { count: number; sports: OtherSport[] }>()
const countryOrder = (country?: string) => (/^(denmark|danmark)$/i.test(country ?? '') ? 0 : isInternational(country) ? 1 : 2)
function otherLeagues(): { count: number; sports: OtherSport[] } {
  const data = getRealData()
  const have = data && othersCache.get(data)
  if (have) return have
  const others = new Map<string, Other>()
  for (const g of data?.external ?? []) {
    if (divisionOfGame(g)) continue
    const key = externalLeagueKey(g.league)
    if (!others.has(key)) others.set(key, { key, name: g.league.name, sport: g.sport, country: g.league.country })
  }
  const sports: OtherSport[] = []
  for (const o of others.values()) {
    const sport = sports.find((s) => s.sport === o.sport) ?? (sports.push({ sport: o.sport, count: 0, countries: [] }), sports.at(-1)!)
    const name = danishCountry(o.country)
    const country = sport.countries.find((c) => c.name === name) ?? (sport.countries.push({ country: o.country, name, leagues: [] }), sport.countries.at(-1)!)
    country.leagues.push(o)
    sport.count++
  }
  for (const s of sports) {
    s.countries.sort((a, b) => countryOrder(a.country) - countryOrder(b.country) || a.name.localeCompare(b.name, 'da'))
    for (const c of s.countries) c.leagues.sort((a, b) => a.name.localeCompare(b.name, 'da'))
  }
  const out = { count: others.size, sports }
  if (data) othersCache.set(data, out)
  return out
}

/** A country's flag in the list of tournaments: a drawn one, else the country's picture from our own domain, else an empty place (so the names line up) */
function CountryFlag({ country, name }: { country?: string; name: string }) {
  if (hasFlag(name)) return <Flag country={name} />
  const code = country ? flagCode(country.replace(/-/g, ' '), true) : undefined
  // eslint-disable-next-line @next/next/no-img-element -- a tiny flag, read only when the list is opened
  return code ? <img className="flag" src={flagImage(code, 14)} alt="" width={14} height={10} loading="lazy" /> : <span className="flag flag--none" aria-hidden />
}

/** Site-wide footer: one compact band – the site's pages, our leagues by sport, every other tournament folded away (still a path for crawlers), and the small print. */
export function Footer() {
  const divisions = shownDivisions()
  const tracking = trackingConfig()
  const hasTracking = !!(tracking.ga || tracking.metaPixel)
  // Every other league and cup we fetch from API-Sports (the admin's choice and the built-in list), once each
  const others = otherLeagues()
  const sports = [...new Set(divisions.map(sportOf))]
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

        {others.count > 0 && (
          <details className="footer__more">
            <summary>Alle turneringer, vi følger ({others.count})</summary>
            {/* Sport by sport, each country in its own block with its tournaments under it, in even columns */}
            {others.sports.map((s) => (
              <section key={s.sport} className="footer__all">
                <h3 className="footer__sport">
                  {sportById(s.sport).label} <span>{s.count}</span>
                </h3>
                <div className="footer__countries">
                  {s.countries.map((c) => (
                    <div key={c.name} className="footer__country">
                      <span className="footer__countryname">
                        <CountryFlag country={c.country} name={c.name} /> {c.name}
                      </span>
                      <ul>
                        {c.leagues.map((o) => (
                          <li key={o.key}>
                            <Link href={paths.league(o.key)}>{o.name}</Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
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
