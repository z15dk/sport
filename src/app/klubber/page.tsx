import type { Metadata } from 'next'
import Link from 'next/link'
import { SEASON, leagueGroups, shownDivisions } from '../../data/leagues'
import { Flag } from '../../components/Flag'
import { TeamBadge } from '../../components/TeamBadge'
import { paths } from '../../lib/site'
import { seasonClubs } from '../../data/season'
import { sportById } from '../../sports'

const clubsIn = (divisionId: string) =>
  seasonClubs()
    .filter((x) => x.division.id === divisionId)
    .map((x) => x.club)
    .sort((a, b) => a.name.localeCompare(b.name, 'da'))

export function generateMetadata(): Metadata {
  const divisions = shownDivisions()
  return {
    title: `Klubber ${SEASON} – fodbold, ishockey og basketball`,
    description: `Alle ${seasonClubs().length} klubber i ${divisions.map((d) => d.name).join(', ')} ${SEASON}.`,
    alternates: { canonical: paths.clubs() },
  }
}

export default function ClubsIndex() {
  return (
    <div className="page">
      <div className="clubs">
        <h1 className="feed__title">
          Klubber
          <span>
            Sæson {SEASON} · {seasonClubs().length} klubber i {shownDivisions().length} ligaer
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
              {clubsIn(d.id).map((c) => (
                <li key={c.id}>
                  <Link href={paths.club(c.slug)}>
                    <TeamBadge link={false} name={c.name} colors={c.colors} size={36} />
                    <span>
                      <strong>{c.name}</strong>
                      {c.city && <em>{c.city}</em>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          )),
        ])}

      </div>
    </div>
  )
}
