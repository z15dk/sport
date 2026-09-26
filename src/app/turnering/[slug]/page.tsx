import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { DIVISIONS, divisionBySlug, seasonOf, sportOf } from '../../../data/leagues'
import { hasRealData } from '../../../data/real'
import { standings } from '../../../data/season'
import { getMatches } from '../../../data/matches'
import { DivisionTabs } from '../../../components/DivisionTabs'
import { MatchRow } from '../../../components/MatchRow'
import { TeamBadge } from '../../../components/TeamBadge'
import { StandingsTable } from '../../../components/StandingsTable'
import { JsonLd, breadcrumbLd, faqLd, leagueLd, webPageLd } from '../../../lib/jsonld'
import { getBadges } from '../../../lib/badges'
import { Faq } from '../../../components/Faq'
import { AdSlot } from '../../../components/AdSlot'
import { LeagueStats } from '../../../components/LeagueStats'
import { LeagueHistory } from '../../../components/LeagueHistory'
import { leagueHistory } from '../../../lib/history'
import { Updated } from '../../../components/Updated'
import { leagueFaq } from '../../../lib/faq'
import { formatLong, isoDate } from '../../../lib/time'
import { paths } from '../../../lib/site'
import { ExternalLeaguePage } from '../../../components/ExternalLeaguePage'
import { apiLeagueTable, externalLeague } from '../../../lib/apisports'
import { archiveLeagueTable } from '../../../lib/history'
import { getRealData } from '../../../data/real'
import { externalLeagueKey, externalToMatch } from '../../../data/external'
import { loadRealData } from '../../../lib/realdata'

export const dynamic = 'force-dynamic'

type Params = Promise<{ slug: string }>

export function generateStaticParams() {
  return DIVISIONS.map((d) => ({ slug: d.slug }))
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const slug = (await params).slug
  // One of API-Sports' other leagues
  if (slug.startsWith('x-')) {
    const league = externalLeague(slug)
    if (!league) return { title: 'Turneringen findes ikke' }
    const name = loadRealData()?.leagueNames?.[slug] ?? league.name
    return {
      title: `${name} – stilling, resultater og kampprogram`,
      description: `Stillingen i ${name}, seneste resultater og kommende kampe.`,
      alternates: { canonical: paths.league(slug) },
    }
  }
  const division = divisionBySlug(slug)
  if (!division || !hasRealData(division.id)) return { title: 'Turneringen findes ikke' }
  const table = standings(division, Date.now())
  const leader = table[0]
  const rounds = Math.max(...table.map((r) => r.played))
  return {
    title: `${division.name} ${seasonOf(division)} – stilling, resultater og kampprogram`,
    description: `Stillingen i ${division.name} ${seasonOf(division)} efter ${rounds} runder. ${leader.club.name} fører med ${leader.points} point. Se alle ${division.clubs.length} klubber, resultater og kommende kampe.`,
    alternates: { canonical: paths.league(division.slug) },
  }
}

/** A page for one of API-Sports' other leagues: their table when the plan allows it, else ours from the statistics bank */
async function externalLeaguePage(slug: string) {
  const found = externalLeague(slug)
  if (!found) notFound()
  const now = Date.now()
  const real = loadRealData() ?? getRealData()
  const league = { ...found, name: real?.leagueNames?.[slug] ?? found.name }
  const fromApi = await apiLeagueTable(found)
  const own = archiveLeagueTable(`ext-${found.api.split('-')[0]}-${found.id}`)
  const upcoming = (real?.external ?? [])
    .filter((g) => externalLeagueKey(g.league) === slug && g.state !== 'finished')
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff))
    .slice(0, 12)
    .map(externalToMatch)
  return (
    <ExternalLeaguePage
      league={league}
      groups={fromApi ?? [own.rows]}
      source={fromApi ? 'api-sports' : 'scoreline'}
      matches={own.matches}
      since={own.since}
      recent={own.recent}
      upcoming={upcoming}
      now={now}
    />
  )
}

export default async function LeaguePage({ params }: { params: Params }) {
  const slug = (await params).slug
  if (slug.startsWith('x-')) return externalLeaguePage(slug)
  const division = divisionBySlug(slug)
  // Leagues without real fixtures are not shown
  if (!division || !hasRealData(division.id)) notFound()
  const now = Date.now()
  const rows = standings(division, now)
  const badges = await getBadges()
  const rounds = Math.max(...rows.map((r) => r.played))
  const today = isoDate(now)
  const todays = getMatches(today, sportOf(division), now)
    .filter((m) => m.leagueSlug === division.slug)
    .sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime())
  const [first, second] = rows
  const faq = leagueFaq(division, rows)

  return (
    <div className="page">
      <JsonLd data={leagueLd(division, badges[division.name])} />
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
          <h1 className="feed__title league-title">
            <span className="league-title__row">
              <TeamBadge link={false} name={division.name} label={division.short} colors={['#0f110c', '#c6f135']} size={56} />
              {division.name}
            </span>
            <span>
              Sæson {seasonOf(division)} · {rows.length} klubber
            </span>
          </h1>
          <DivisionTabs active={division.slug} />
        </div>

        <p className="lead">
          Efter {rounds} runder fører {first.club.name} {division.name} med {first.points} point,{' '}
          {first.points - second.points === 0 ? 'lige med' : `${first.points - second.points} point foran`}{' '}
          {second.club.name}. Nederst ligger {rows.at(-1)!.club.name} med {rows.at(-1)!.points} point.
        </p>
        <Updated at={now} />

        <section className="panel table-panel">
          <header className="table-panel__head">
            <h2 className="panel__title">Stilling</h2>
            <span className="tag">
              Efter {rounds} runder
            </span>
          </header>
          <StandingsTable division={division} rows={rows} />
        </section>

        <LeagueStats division={division} />
        {(() => {
          const history = leagueHistory(division.id)
          return history ? <LeagueHistory name={division.name} history={history} /> : null
        })()}

        <AdSlot placement="feed" />

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

        <AdSlot placement="content" />
        <Faq items={faq} />
      </div>
    </div>
  )
}
