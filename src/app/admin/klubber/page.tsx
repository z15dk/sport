import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { isAdmin } from '../../../lib/admin'
import { clubLogoOverview, type LogoSource } from '../../../lib/badges'
import { DIVISIONS } from '../../../data/leagues'
import { LogoEditor } from '../../../components/admin/LogoEditor'
import { TeamBadge } from '../../../components/TeamBadge'
import { paths } from '../../../lib/site'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Klubber · Admin', robots: { index: false, follow: false } }

const SOURCE: Record<LogoSource, string> = {
  upload: 'Uploadet her',
  fil: 'Fil i public/logos',
  thesportsdb: 'TheSportsDB',
  forbogstaver: 'Intet logo',
}

type SearchParams = Promise<{ q?: string; liga?: string; kilde?: string }>

/** Every club with its logo; logos can be uploaded or reset */
export default async function AdminClubs({ searchParams }: { searchParams: SearchParams }) {
  if (!(await isAdmin())) redirect('/admin')
  const { q = '', liga = '', kilde = '' } = await searchParams
  const all = clubLogoOverview()
  const query = q.trim().toLowerCase()
  const rows = all.filter(
    (r) =>
      (!query || r.club.name.toLowerCase().includes(query)) &&
      (!liga || r.division.id === liga) &&
      (!kilde || r.source === kilde),
  )
  const count = (s: LogoSource) => all.filter((r) => r.source === s).length

  return (
    <div className="page">
      <div className="clubs admin">
        <header className="admin__head">
          <h1 className="feed__title">
            Klubber
            <span>
              {all.length} klubber · {count('upload')} uploadet · {count('forbogstaver')} uden logo
            </span>
          </h1>
          <form method="post" action="/api/admin/logout">
            <button className="text-btn" type="submit">
              Log ud
            </button>
          </form>
        </header>

        <form className="panel admin-filter" method="get">
          <input type="search" name="q" defaultValue={q} placeholder="Søg klub" aria-label="Søg klub" />
          <select name="liga" defaultValue={liga} aria-label="Liga">
            <option value="">Alle ligaer</option>
            {DIVISIONS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <select name="kilde" defaultValue={kilde} aria-label="Logo">
            <option value="">Alle logoer</option>
            {(Object.keys(SOURCE) as LogoSource[]).map((s) => (
              <option key={s} value={s}>
                {SOURCE[s]} ({count(s)})
              </option>
            ))}
          </select>
          <button className="pill is-active" type="submit">
            Vis
          </button>
        </form>

        <section className="panel">
          <ul className="admin-list">
            {rows.map(({ club, division, url, source }) => (
              <li key={club.id} className="admin-list__row">
                <TeamBadge link={false} name={club.name} src={url} colors={club.colors} size={44} />
                <span className="admin-list__name">
                  {club.slug ? (
                    <a href={paths.club(club.slug)} target="_blank" rel="noopener">
                      {club.name}
                    </a>
                  ) : (
                    club.name
                  )}
                  <em>
                    {division.name}
                    {club.city ? ` · ${club.city}` : ''}
                  </em>
                </span>
                <span className={`admin-source admin-source--${source}`}>{SOURCE[source]}</span>
                {club.slug ? <LogoEditor slug={club.slug} name={club.name} uploaded={source === 'upload'} /> : <span />}
              </li>
            ))}
          </ul>
          {rows.length === 0 && <p className="muted pad">Ingen klubber matcher.</p>}
        </section>
      </div>
    </div>
  )
}
