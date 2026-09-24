import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SEASON, allClubs, clubBySlug } from '../../../data/danishClubs'
import { standings } from '../../../data/fixtures'
import { clubMatches } from '../../../data/matches'
import { ROUNDS_PLAYED, clubStats } from '../../../data/matchInsights'
import { FormChips } from '../../../components/FormChips'
import { MatchRow } from '../../../components/MatchRow'
import { StandingsTable } from '../../../components/StandingsTable'
import { TeamBadge } from '../../../components/TeamBadge'
import { JsonLd, breadcrumbLd, clubLd } from '../../../lib/jsonld'
import { addDays, isoDate } from '../../../lib/time'
import { paths } from '../../../lib/site'

export const dynamic = 'force-dynamic'

type Params = Promise<{ slug: string }>

export function generateStaticParams() {
  return allClubs().map(({ club }) => ({ slug: club.slug }))
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const found = clubBySlug((await params).slug)
  if (!found) return { title: 'Klubben findes ikke' }
  const { club, division } = found
  const stats = clubStats(club.name)!
  return {
    title: `${club.name} – resultater, kampprogram og stilling ${SEASON}`,
    description: `${club.name} fra ${club.city} spiller i ${division.name} ${SEASON} og ligger nr. ${stats.position} med ${stats.row.points} point efter ${stats.row.played} kampe. Se seneste resultater og kommende kampe.`,
    alternates: { canonical: paths.club(club.slug) },
  }
}

export default async function ClubPage({ params }: { params: Params }) {
  const found = clubBySlug((await params).slug)
  if (!found) notFound()
  const { club, division } = found
  const stats = clubStats(club.name)!
  const r = stats.row
  const now = Date.now()
  const today = isoDate(now)
  const around = clubMatches(club.name, addDays(today, -7), 15, now)
  const recent = around.filter((m) => m.state === 'finished').slice(-5).reverse()
  const upcoming = around.filter((m) => m.state !== 'finished').slice(0, 5)
  const table = standings(division, ROUNDS_PLAYED)
  const i = table.findIndex((x) => x.club.id === club.id)
  // Five rows around the club
  const start = Math.max(0, Math.min(i - 2, table.length - 5))
  const nearby = table.slice(start, start + 5)

  return (
    <div className="page">
      <JsonLd data={clubLd(club, division)} />
      <JsonLd
        data={breadcrumbLd([
          { name: 'Klubber', path: paths.clubs() },
          { name: club.name, path: paths.club(club.slug) },
        ])}
      />
      <div className="clubs">
        <header className="club-hero" style={{ '--club-bg': club.colors[0], '--club-fg': club.colors[1] } as React.CSSProperties}>
          <TeamBadge name={club.name} colors={club.colors} size={96} />
          <div className="club-hero__text">
            <span className="club-hero__eyebrow">
              <Link href={paths.league(division.slug)}>{division.name}</Link> · {club.city}
            </span>
            <h1>{club.name}</h1>
            {club.unverified && <span className="unverified">Rækken for {SEASON} er ikke bekræftet</span>}
          </div>
        </header>

        <p className="lead">
          {club.name} ligger nr. {stats.position} i {division.name} med {r.points} point efter {r.played} kampe ({r.won}{' '}
          sejre, {r.drawn} uafgjorte og {r.lost} nederlag) og en målscore på {r.goalsFor}-{r.goalsAgainst}.
        </p>

        <section className="tiles tiles--club" aria-label="Sæsonen i tal">
          <div className="tile tile--lime">
            <span className="tile__label">Placering</span>
            <strong className="tile__value">{stats.position}.</strong>
          </div>
          <div className="tile tile--ink">
            <span className="tile__label">Point</span>
            <strong className="tile__value">{r.points}</strong>
          </div>
          <div className="tile tile--blush">
            <span className="tile__label">Mål</span>
            <strong className="tile__value">
              {r.goalsFor}-{r.goalsAgainst}
            </strong>
          </div>
          <div className="tile tile--form">
            <span className="tile__label">Form</span>
            <FormChips form={r.form} />
          </div>
        </section>

        <div className="club-grid">
          <section className="league">
            <header className="league__header">
              <div className="league__toggle">
                <h2 className="league__name">Seneste resultater</h2>
              </div>
            </header>
            <ul className="league__matches">
              {recent.map((m) => (
                <MatchRow key={m.id} match={m} showDate />
              ))}
            </ul>
          </section>
          <section className="league">
            <header className="league__header">
              <div className="league__toggle">
                <h2 className="league__name">Kommende kampe</h2>
              </div>
            </header>
            <ul className="league__matches">
              {upcoming.map((m) => (
                <MatchRow key={m.id} match={m} showDate />
              ))}
            </ul>
          </section>
        </div>

        <section className="panel table-panel">
          <header className="table-panel__head">
            <h2 className="panel__title">Stilling · {division.name}</h2>
            <Link className="text-btn" href={paths.league(division.slug)}>
              Hele stillingen
            </Link>
          </header>
          <StandingsTable division={division} rows={nearby} highlight={club.id} offset={start} total={table.length} />
        </section>
        <p className="muted small">Alle resultater og tal er fiktive.</p>
      </div>
    </div>
  )
}
