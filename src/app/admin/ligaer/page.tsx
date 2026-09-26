import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AdminNav } from '../../../components/admin/AdminNav'
import { LogoEditor } from '../../../components/admin/LogoEditor'
import { NameEditor } from '../../../components/admin/NameEditor'
import { TeamBadge } from '../../../components/TeamBadge'
import { isAdmin } from '../../../lib/admin'
import { getBadges } from '../../../lib/badges'
import { customLogoUrl } from '../../../lib/customLogos'
import { loadRealData } from '../../../lib/realdata'
import { apiLeagueCatalog } from '../../../lib/apisports'
import { LeagueFollowToggle } from '../../../components/admin/LeagueFollowToggle'
import { DIVISIONS, externalLeagueKey, competitionLabel } from '../../../data/leagues'
import { divisionOfGame } from '../../../data/ourLeagues'
import { danishCountry } from '../../../data/countries'
import { SPORTS } from '../../../sports'
import { paths } from '../../../lib/site'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Ligaer · Admin', robots: { index: false, follow: false } }

const sportLabel = (id: string) => SPORTS.find((s) => s.id === id)?.label ?? id

/** Every league: logo upload and name, for ours and for API-Sports' other leagues */
export default async function AdminLeagues() {
  if (!(await isAdmin())) redirect('/admin')
  const real = loadRealData()
  const badges = await getBadges()

  // API-Sports' leagues that are not ours, once each, keyed before any renaming
  const external = new Map<string, { key: string; name: string; original: string; country?: string; sport: string; logo?: string }>()
  for (const g of real?.external ?? []) {
    if (divisionOfGame(g)) continue
    const original = g.league.originalName ?? g.league.name
    const key = externalLeagueKey({ name: original, country: g.league.country })
    if (!external.has(key)) external.set(key, { key, name: g.league.name, original, country: g.league.country, sport: g.sport, logo: g.league.logo })
  }
  // Every football league API-Sports has, by country (Denmark first)
  const catalog = await apiLeagueCatalog()
  const countries = new Map<string, typeof catalog.leagues>()
  for (const l of catalog.leagues) countries.set(l.country, [...(countries.get(l.country) ?? []), l])
  const byCountry = [...countries.entries()]
    .map(([c, list]) => [c, list.sort((a, b) => Number(b.followed) - Number(a.followed) || a.name.localeCompare(b.name, 'da'))] as const)
    .sort(([a], [b]) => (a === 'Denmark' ? -1 : b === 'Denmark' ? 1 : danishCountry(a).localeCompare(danishCountry(b), 'da')))
  const others = [...external.values()].sort((a, b) => (a.country ?? '').localeCompare(b.country ?? '', 'da') || a.name.localeCompare(b.name, 'da'))

  return (
    <div className="page">
      <div className="clubs admin">
        <AdminNav current="/admin/ligaer" />
        <h1 className="feed__title">
          Ligaer
          <span>
            {DIVISIONS.length} af vores egne · {others.length} fra API-Sports
          </span>
        </h1>

        <section className="panel">
          <h2 className="panel__title">Vores ligaer</h2>
          <ul className="admin-list">
            {DIVISIONS.map((d) => {
              const uploaded = !!customLogoUrl(`liga-${d.slug}`)
              return (
                <li key={d.id} className="admin-list__row">
                  <TeamBadge link={false} name={d.name} src={badges[d.name]} size={44} label={competitionLabel(d.name)} />
                  <span className="admin-list__name">
                    <NameEditor slug={d.slug} name={d.name} originalName={d.originalName} endpoint="/api/admin/league-name" />
                    <em>
                      {sportLabel(d.sport ?? 'soccer')} · {d.country} ·{' '}
                      <a href={paths.league(d.slug)} target="_blank" rel="noopener">
                        Se turneringsside
                      </a>
                    </em>
                  </span>
                  <span className={`admin-source admin-source--${uploaded ? 'upload' : badges[d.name] ? 'thesportsdb' : 'forbogstaver'}`}>
                    {uploaded ? 'Uploadet her' : badges[d.name] ? 'Automatisk' : 'Intet logo'}
                  </span>
                  <LogoEditor slug={`liga-${d.slug}`} name={d.name} uploaded={uploaded} />
                </li>
              )
            })}
          </ul>
        </section>

        <section className="panel">
          <h2 className="panel__title">Ligaer fra API-Sports</h2>
          <p className="muted small pad">De ligaer, der har kampe i API-Sports&apos; data lige nu (i går til et par dage frem).</p>
          <ul className="admin-list">
            {others.map((l) => {
              const uploaded = !!customLogoUrl(`liga-${l.key}`)
              return (
                <li key={l.key} className="admin-list__row">
                  <TeamBadge link={false} name={l.name} src={l.logo} size={44} label={competitionLabel(l.name)} />
                  <span className="admin-list__name">
                    <NameEditor slug={l.key} name={l.name} originalName={l.original} endpoint="/api/admin/league-name" />
                    <em>
                      {sportLabel(l.sport)} · {danishCountry(l.country)}
                    </em>
                  </span>
                  <span className={`admin-source admin-source--${uploaded ? 'upload' : l.logo ? 'thesportsdb' : 'forbogstaver'}`}>
                    {uploaded ? 'Uploadet her' : l.logo ? 'API-Sports' : 'Intet logo'}
                  </span>
                  <LogoEditor slug={`liga-${l.key}`} name={l.name} uploaded={uploaded} />
                </li>
              )
            })}
          </ul>
          {others.length === 0 && <p className="muted pad">Ingen ligaer fra API-Sports lige nu.</p>}
        </section>

        <section className="panel">
          <h2 className="panel__title">Alle fodboldligaer hos API-Sports</h2>
          <p className="muted small pad">
            {catalog.leagues.length} ligaer og pokaler med en aktuel sæson
            {catalog.fetchedAt ? `, hentet ${new Date(catalog.fetchedAt).toLocaleString('da-DK', { timeZone: 'Europe/Copenhagen' })}` : ''}. Slå en liga til, så henter vores job dens kampe (på forsiden og med egen side, stilling og
            topscorere); &quot;standard&quot; er den faste liste, og &quot;nulstil&quot; går tilbage til den. Mærkerne viser, hvad API-Sports har i denne sæson: mål og kort, opstillinger, kampstatistik, spillerstatistik,
            stilling, topscorere og odds.
            {catalog.error && ` Fejl: ${catalog.error}`}
          </p>
          {byCountry.length > 0 && (
            <div className="catalog__countries pad">
              <strong>
                {byCountry.length} lande · {catalog.leagues.filter((l) => l.followed).length} af {catalog.leagues.length} ligaer hentes
              </strong>
              <ul>
                {byCountry.map(([country, leagues]) => (
                  <li key={country}>
                    <a href={`#land-${country}`} className={leagues.some((l) => l.followed) ? 'is-on' : ''}>
                      {danishCountry(country)} <em>{leagues.length}</em>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {byCountry.map(([country, leagues]) => (
            <details key={country} id={`land-${country}`} className="catalog" open={country === 'Denmark'}>
              <summary>
                {danishCountry(country)} <span className="muted">· {leagues.length} · {leagues.filter((l) => l.followed).length} hentes</span>
              </summary>
              <ul className="admin-list">
                {leagues.map((l) => (
                  <li key={l.id} className="admin-list__row catalog__row">
                    <TeamBadge link={false} name={l.name} src={l.logo} size={32} label={competitionLabel(l.name)} />
                    <span className="admin-list__name">
                      {l.name}
                      <em>
                        {l.type === 'Cup' ? 'Pokal' : 'Liga'} · id {l.id}
                        {l.season ? ` · sæson ${l.season}` : ''}
                        {l.ours ? ` · vores ${l.ours}` : ''}
                      </em>
                    </span>
                    <span className="catalog__coverage">
                      {(
                        [
                          ['events', 'Mål/kort'],
                          ['lineups', 'Opstillinger'],
                          ['statistics', 'Kampstatistik'],
                          ['players', 'Spillere'],
                          ['standings', 'Stilling'],
                          ['topScorers', 'Topscorere'],
                          ['odds', 'Odds'],
                        ] as const
                      ).map(([k, label]) => (
                        <span key={k} className={`catalog__chip${l.coverage[k] ? ' is-on' : ''}`}>
                          {label}
                        </span>
                      ))}
                    </span>
                    {l.fixed ? (
                      <span className="admin-source admin-source--upload" title="Vores egen liga eller pokal – hentes altid">
                        Hentes altid
                      </span>
                    ) : (
                      <LeagueFollowToggle api="football" id={l.id} followed={l.followed} choice={l.choice} />
                    )}
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </section>
      </div>
    </div>
  )
}
