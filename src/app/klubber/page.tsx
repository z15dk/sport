import type { Metadata } from 'next'
import Link from 'next/link'
import { DIVISIONS, SEASON, leagueGroups } from '../../data/leagues'
import { Flag } from '../../components/Flag'
import { TeamBadge } from '../../components/TeamBadge'
import { paths } from '../../lib/site'
import { allTeams, type TeamEntry } from '../../data/teams'
import { sportById } from '../../sports'

export const metadata: Metadata = {
  title: `Klubber ${SEASON} – fodbold, ishockey og basketball`,
  description: `Alle ${DIVISIONS.reduce((n, d) => n + d.clubs.length, 0)} klubber i ${DIVISIONS.map((d) => d.name).join(', ')} ${SEASON}.`,
  alternates: { canonical: paths.clubs() },
}

export default function ClubsIndex() {
  // Every team outside the football leagues, grouped by sport and league
  const others = new Map<string, TeamEntry[]>()
  for (const t of allTeams()) {
    if (t.season) continue
    const key = `${sportById(t.sport).label} · ${t.league}`
    others.set(key, [...(others.get(key) ?? []), t])
  }
  return (
    <div className="page">
      <div className="clubs">
        <h1 className="feed__title">
          Klubber
          <span>
            Sæson {SEASON} · {DIVISIONS.reduce((n, d) => n + d.clubs.length, 0)} klubber i {DIVISIONS.length} ligaer
          </span>
        </h1>
        {leagueGroups().map((g) => [
          <h2 key={`${g.sport}-${g.country}`} className="feed__title clubs__subtitle clubs__country">
            <Flag country={g.country} /> {sportById(g.sport).label} · {g.country}
          </h2>,
          ...g.divisions.map((d) => (
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
                    <TeamBadge link={false} name={c.name} colors={c.colors} size={36} />
                    <span>
                      <strong>{c.name}</strong>
                      <em>{c.city}</em>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          )),
        ])}

        <h2 className="feed__title clubs__subtitle">Andre sportsgrene</h2>
        {[...others.entries()].map(([title, teams]) => (
          <section key={title} className="panel club-index">
            <header className="table-panel__head">
              <h3 className="panel__title">{title}</h3>
            </header>
            <ul className="club-index__grid">
              {teams.map((t) => (
                <li key={t.slug}>
                  <Link href={paths.club(t.slug)}>
                    <TeamBadge link={false} name={t.name} colors={t.colors} size={36} />
                    <span>
                      <strong>{t.name}</strong>
                      <em>{t.country}</em>
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
