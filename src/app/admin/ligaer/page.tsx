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
      </div>
    </div>
  )
}
