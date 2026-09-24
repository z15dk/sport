import type { Metadata } from 'next'
import Link from 'next/link'
import { DIVISIONS, SEASON } from '../../data/danishClubs'
import { TeamBadge } from '../../components/TeamBadge'
import { paths } from '../../lib/site'

export const metadata: Metadata = {
  title: `Danske fodboldklubber ${SEASON} – Superliga til 3. division`,
  description: `Alle ${DIVISIONS.reduce((n, d) => n + d.clubs.length, 0)} klubber i Superligaen, 1., 2. og 3. division ${SEASON}.`,
  alternates: { canonical: paths.clubs() },
}

export default function ClubsIndex() {
  return (
    <div className="page">
      <div className="clubs">
        <h1 className="feed__title">
          Danske klubber
          <span>
            Sæson {SEASON} · {DIVISIONS.reduce((n, d) => n + d.clubs.length, 0)} klubber i fire rækker
          </span>
        </h1>
        {DIVISIONS.map((d) => (
          <section key={d.id} className="panel club-index">
            <header className="table-panel__head">
              <h2 className="panel__title">{d.name}</h2>
              <Link className="text-btn" href={paths.league(d.slug)}>
                Stilling
              </Link>
            </header>
            <ul className="club-index__grid">
              {d.clubs.map((c) => (
                <li key={c.id}>
                  <Link href={paths.club(c.slug)}>
                    <TeamBadge name={c.name} colors={c.colors} size={36} />
                    <span>
                      <strong>{c.name}</strong>
                      <em>{c.city}</em>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
