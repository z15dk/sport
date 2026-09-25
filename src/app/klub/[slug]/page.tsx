import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { seasonOf, sportOf, type Club, type Division } from '../../../data/leagues'
import { allTeams, teamBySlug, type TeamEntry } from '../../../data/teams'
import { standings } from '../../../data/season'
import { clubMatches, teamMatches } from '../../../data/matches'
import { clubStats } from '../../../data/matchInsights'
import { ClubMatches } from '../../../components/ClubMatches'
import { FormChart } from '../../../components/FormChart'
import { FormChips } from '../../../components/FormChips'
import { MatchRow } from '../../../components/MatchRow'
import { StandingsTable } from '../../../components/StandingsTable'
import { TeamBadge } from '../../../components/TeamBadge'
import { JsonLd, breadcrumbLd, clubLd, faqLd, teamPageLd, webPageLd } from '../../../lib/jsonld'
import { Faq } from '../../../components/Faq'
import { AdSlot } from '../../../components/AdSlot'
import { ClubHistory } from '../../../components/ClubHistory'
import { clubHistory } from '../../../lib/history'
import { Updated } from '../../../components/Updated'
import { clubFaq, teamFaq } from '../../../lib/faq'
import { addDays, isoDate } from '../../../lib/time'
import { paths } from '../../../lib/site'
import { sportById } from '../../../sports'

export const dynamic = 'force-dynamic'

type Params = Promise<{ slug: string }>

export function generateStaticParams() {
  return allTeams().map((t) => ({ slug: t.slug }))
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const team = teamBySlug((await params).slug)
  if (!team) return { title: 'Klubben findes ikke' }
  if (!team.season) {
    const sport = sportById(team.sport).label.toLowerCase()
    return {
      title: `${team.name} – resultater og kampprogram (${team.league})`,
      description: `Seneste resultater og kommende kampe for ${team.name} i ${team.league} (${sport}${team.country ? `, ${team.country}` : ''}).`,
      alternates: { canonical: paths.club(team.slug) },
    }
  }
  const { club, division } = team.season
  const stats = clubStats(club.name, Date.now())!
  return {
    title: `${club.name} – resultater, kampprogram og stilling ${seasonOf(division)}`,
    description: `${club.name} fra ${club.city} spiller i ${division.name} ${seasonOf(division)} og ligger nr. ${stats.position} med ${stats.row.points} point efter ${stats.row.played} kampe. Se seneste resultater og kommende kampe.`,
    alternates: { canonical: paths.club(club.slug) },
  }
}

export default async function ClubPage({ params }: { params: Params }) {
  const team = teamBySlug((await params).slug)
  if (!team) notFound()
  return team.season ? <LeagueClub {...team.season} /> : <TeamPage team={team} />
}

/** Full page for clubs in the leagues we cover, which have season and table data */
function LeagueClub({ club, division }: { club: Club; division: Division }) {
  const now = Date.now()
  const stats = clubStats(club.name, now)!
  const r = stats.row
  const sport = sportOf(division)
  const season = clubMatches(club.name, now)
  const recent = season.filter((m) => m.state === 'finished').reverse()
  const upcoming = season.filter((m) => m.state !== 'finished')
  const faq = clubFaq(club, division, stats, upcoming[0], recent[0])
  const history = clubHistory(club)
  const table = standings(division, now)
  const i = table.findIndex((x) => x.club.id === club.id)
  // Five rows around the club
  const start = Math.max(0, Math.min(i - 2, table.length - 5))
  const nearby = table.slice(start, start + 5)

  return (
    <div className="page">
      <JsonLd data={clubLd(club, division)} />
      <JsonLd data={webPageLd(paths.club(club.slug), club.name, new Date(now))} />
      <JsonLd data={faqLd(faq)} />
      <JsonLd
        data={breadcrumbLd([
          { name: 'Klubber', path: paths.clubs() },
          { name: club.name, path: paths.club(club.slug) },
        ])}
      />
      <div className="clubs">
        <header className="club-hero" style={{ '--club-bg': club.colors[0], '--club-fg': club.colors[1] } as React.CSSProperties}>
          <TeamBadge link={false} name={club.name} colors={club.colors} size={96} />
          <div className="club-hero__text">
            <span className="club-hero__eyebrow">
              <Link href={paths.league(division.slug)}>{division.name}</Link>
              {club.city && ` · ${club.city}`}
            </span>
            <h1>{club.name}</h1>
            {club.unverified && <span className="unverified">Rækken for {seasonOf(division)} er ikke bekræftet</span>}
          </div>
        </header>

        <p className="lead">
          {club.name} ligger nr. {stats.position} i {division.name} med {r.points} point efter {r.played} kampe ({r.won}{' '}
          sejre{sport === 'soccer' ? `, ${r.drawn} uafgjorte` : ''} og {r.lost} nederlag
          {sport === 'ice_hockey' && r.otWon + r.otLost > 0 ? `, heraf ${r.otWon + r.otLost} afgjort i forlænget spil` : ''}) og en
          {sport === 'basketball' ? ' samlet score' : ' målscore'} på {r.goalsFor}-{r.goalsAgainst}.
        </p>
        <Updated at={now} />

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
            <span className="tile__label">{sport === 'basketball' ? 'Score' : 'Mål'}</span>
            <strong className="tile__value">
              {r.goalsFor}-{r.goalsAgainst}
            </strong>
          </div>
          <div className="tile tile--form">
            <span className="tile__label">Form</span>
            <FormChips form={r.form} />
          </div>
        </section>

        <div className="club-layout">
          <ClubMatches clubName={club.name} initialNow={now} />
          <div className="club-layout__side">
            <FormChart clubName={club.name} initialNow={now} />
            <section className="panel table-panel">
              <header className="table-panel__head">
                <h2 className="panel__title">Stilling · {division.name}</h2>
                <Link className="text-btn" href={paths.league(division.slug)}>
                  Hele stillingen
                </Link>
              </header>
              <StandingsTable division={division} rows={nearby} highlight={club.id} offset={start} total={table.length} compact />
            </section>
          </div>
        </div>

        {history && <ClubHistory name={club.name} history={history} />}

        <AdSlot placement="content" />
        <Faq items={faq} />
        <p className="muted small">Kampe og resultater: TheSportsDB.</p>
      </div>
    </div>
  )
}

/** Page for any other team: built from its matches alone */
function TeamPage({ team }: { team: TeamEntry }) {
  const now = Date.now()
  const today = isoDate(now)
  const around = teamMatches(team.name, team.sport, addDays(today, -7), 15, now)
  const recent = around.filter((m) => m.state === 'finished').slice(-5).reverse()
  const upcoming = around.filter((m) => m.state !== 'finished').slice(0, 5)
  const faq = teamFaq(team, upcoming[0], recent[0])
  const sport = sportById(team.sport)
  const last = recent[0]
  const next = upcoming[0]
  const opponent = (m: typeof last) => (m.home.name === team.name ? m.away.name : m.home.name)
  const score = (m: typeof last) =>
    m.home.name === team.name ? `${m.home.score ?? 0}-${m.away.score ?? 0}` : `${m.away.score ?? 0}-${m.home.score ?? 0}`

  return (
    <div className="page">
      <JsonLd data={teamPageLd(team)} />
      <JsonLd data={webPageLd(paths.club(team.slug), team.name, new Date(now))} />
      <JsonLd data={faqLd(faq)} />
      <JsonLd
        data={breadcrumbLd([
          { name: 'Klubber', path: paths.clubs() },
          { name: team.name, path: paths.club(team.slug) },
        ])}
      />
      <div className="clubs">
        <header className="club-hero">
          <TeamBadge link={false} name={team.name} colors={team.colors ?? ['#c6f135', '#0f110c']} size={96} />
          <div className="club-hero__text">
            <span className="club-hero__eyebrow">
              {sport.label} · {team.league}
              {team.country && ` · ${team.country}`}
            </span>
            <h1>{team.name}</h1>
          </div>
        </header>

        <p className="lead">
          {team.name} spiller i {team.league}.
          {last && ` Seneste kamp: ${score(last)} mod ${opponent(last)}.`}
          {next && ` Næste kamp er mod ${opponent(next)}.`}
        </p>
        <Updated at={now} />

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

        <AdSlot placement="content" />
        <Faq items={faq} />
      </div>
    </div>
  )
}
