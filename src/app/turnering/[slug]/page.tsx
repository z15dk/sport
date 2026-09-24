import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { DIVISIONS, SEASON, divisionBySlug } from '../../../data/danishClubs'
import { standings } from '../../../data/fixtures'
import { getMatches } from '../../../data/matches'
import { ROUNDS_PLAYED } from '../../../data/matchInsights'
import { DivisionTabs } from '../../../components/DivisionTabs'
import { MatchRow } from '../../../components/MatchRow'
import { StandingsTable } from '../../../components/StandingsTable'
import { JsonLd, breadcrumbLd, faqLd, leagueLd, webPageLd } from '../../../lib/jsonld'
import { Faq } from '../../../components/Faq'
import { Updated } from '../../../components/Updated'
import { leagueFaq } from '../../../lib/faq'
import { formatLong, isoDate } from '../../../lib/time'
import { paths } from '../../../lib/site'

export const dynamic = 'force-dynamic'

type Params = Promise<{ slug: string }>

export function generateStaticParams() {
  return DIVISIONS.map((d) => ({ slug: d.slug }))
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const division = divisionBySlug((await params).slug)
  if (!division) return { title: 'Turneringen findes ikke' }
  const leader = standings(division, ROUNDS_PLAYED)[0]
  return {
    title: `${division.name} ${SEASON} – stilling, resultater og kampprogram`,
    description: `Stillingen i ${division.name} ${SEASON} efter ${ROUNDS_PLAYED} runder. ${leader.club.name} fører med ${leader.points} point. Se alle ${division.clubs.length} klubber, resultater og kommende kampe.`,
    alternates: { canonical: paths.league(division.slug) },
  }
}

export default async function LeaguePage({ params }: { params: Params }) {
  const division = divisionBySlug((await params).slug)
  if (!division) notFound()
  const rows = standings(division, ROUNDS_PLAYED)
  const now = Date.now()
  const today = isoDate(now)
  const todays = getMatches(today, 'soccer', now)
    .filter((m) => m.leagueSlug === division.slug)
    .sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime())
  const [first, second] = rows
  const faq = leagueFaq(division, rows)

  return (
    <div className="page">
      <JsonLd data={leagueLd(division)} />
      <JsonLd data={webPageLd(paths.league(division.slug), division.name, new Date(now))} />
      <JsonLd data={faqLd(faq)} />
      <JsonLd
        data={breadcrumbLd([
          { name: 'Turneringer', path: paths.league('superliga') },
          { name: division.name, path: paths.league(division.slug) },
        ])}
      />
      <div className="clubs">
        <div className="clubs__head">
          <h1 className="feed__title">
            {division.name}
            <span>
              Sæson {SEASON} · {division.clubs.length} klubber
            </span>
          </h1>
          <DivisionTabs active={division.slug} />
        </div>

        <p className="lead">
          Efter {ROUNDS_PLAYED} runder fører {first.club.name} {division.name} med {first.points} point,{' '}
          {first.points - second.points === 0 ? 'lige med' : `${first.points - second.points} point foran`}{' '}
          {second.club.name}. Nederst ligger {rows.at(-1)!.club.name} med {rows.at(-1)!.points} point.
        </p>
        <Updated at={now} />

        <section className="panel table-panel">
          <header className="table-panel__head">
            <h2 className="panel__title">Stilling</h2>
            <span className="tag">Fiktiv · efter {ROUNDS_PLAYED} runder</span>
          </header>
          <StandingsTable division={division} rows={rows} />
        </section>

        {todays.length > 0 && (
          <section className="league">
            <header className="league__header">
              <div className="league__toggle">
                <span className="league__titles">
                  <span className="league__country">{formatLong(today)}</span>
                  <h2 className="league__name">Dagens kampe</h2>
                </span>
              </div>
            </header>
            <ul className="league__matches">
              {todays.map((m) => (
                <MatchRow key={m.id} match={m} />
              ))}
            </ul>
          </section>
        )}

        <Faq items={faq} />
      </div>
    </div>
  )
}
