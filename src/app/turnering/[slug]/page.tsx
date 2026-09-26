import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { DIVISIONS, divisionBySlug, seasonOf, sportOf } from '../../../data/leagues'
import { hasRealData } from '../../../data/real'
import { allFixtures, isFinished, standings, toMatch } from '../../../data/season'
import { externalMatch, getMatches } from '../../../data/matches'
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
import { apiLeagueTable, externalLeague, teamLogos } from '../../../lib/apisports'
import { archiveLeagueTable } from '../../../lib/history'
import { BASELINES, sameLeagueKeys } from '../../../data/baselines'
import { customLogoUrl } from '../../../lib/customLogos'
import { alike } from '../../../data/aliases'
import { getRealData } from '../../../data/real'
import { externalLeagueKey } from '../../../data/external'
import { cupOfGame } from '../../../data/cups'
import type { Match } from '../../../types'
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
    const league = knownLeague(slug)
    if (!league) return { title: 'Turneringen findes ikke' }
    const names = loadRealData()?.leagueNames
    const cup = cupOfGame({ sport: league.sport, league })
    const name = sameLeagueKeys(slug).map((k) => names?.[k]).find(Boolean) ?? cup?.name ?? league.name
    return {
      title: cup ? `${name} – resultater og kampprogram runde for runde` : `${name} – stilling, resultater og kampprogram`,
      description: cup ? `Alle kampe i ${name}: resultater fra hver runde og kommende kampe.` : `Stillingen i ${name}, seneste resultater og kommende kampe.`,
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
/** A league we know from API-Sports' games, or from a starting table entered before any of its games came */
function knownLeague(slug: string) {
  const b = BASELINES[slug]
  return externalLeague(slug) ?? (b && { key: slug, api: 'football', id: '', name: b.league.name, country: b.league.country, sport: b.league.sport, lastSeen: 0 })
}

async function externalLeaguePage(slug: string) {
  const found = knownLeague(slug)
  if (!found) notFound()
  const now = Date.now()
  const real = loadRealData() ?? getRealData()
  const keys = sameLeagueKeys(slug)
  const league = {
    ...found,
    name: keys.map((k) => real?.leagueNames?.[k]).find(Boolean) ?? cupOfGame({ sport: found.sport, league: found })?.name ?? found.name,
    logo: keys.map((k) => customLogoUrl(`liga-${k}`)).find(Boolean) ?? found.logo,
  }
  const fromApi = found.id ? await apiLeagueTable(found) : undefined
  const baseline = BASELINES[slug]
  const own = archiveLeagueTable(`ext-${found.api.split('-')[0]}-${found.id}`, baseline)
  // A team's logo from API-Sports' games, also when the table uses another name ("F.C. København" is "FC Copenhagen W")
  const logos = teamLogos()
  const women = (n: string) => n.replace(/\b(w|women|q)\b\.?/gi, '').trim()
  const logoFor = (name: string) => {
    const names = [name, ...(baseline?.rows.find((r) => r.name === name)?.aliases ?? [])]
    for (const n of names) if (logos.has(n)) return logos.get(n)
    const plain = names.map((n) => women(n).toLowerCase())
    const found = [...logos.keys()].filter((k) => plain.includes(women(k).toLowerCase()) || alike(names.map(women), women(k)))
    return logos.get(found.find((k) => women(k) !== k) ?? found[0] ?? '')
  }
  const games = (real?.external ?? []).filter((g) => keys.includes(externalLeagueKey(g.league)))
  const upcoming = games
    .filter((g) => g.state !== 'finished')
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff))
    .slice(0, 12)
    .map(externalMatch)
  // A cup: its rounds instead of a table (newest first), and saved games from before we kept the whole cup
  const cup = cupOfGame({ sport: found.sport, league: found })
  const played = cup ? games.filter((g) => g.state === 'finished').sort((a, b) => b.kickoff.localeCompare(a.kickoff)) : []
  const rounds: { name: string; matches: Match[] }[] = []
  for (const g of played) {
    const name = roundLabel(g.round)
    const round = rounds.find((r) => r.name === name) ?? (rounds.push({ name, matches: [] }), rounds.at(-1)!)
    round.matches.push(externalMatch(g))
  }
  const firstKept = played.at(-1) ? Date.parse(played.at(-1)!.kickoff) - 86_400_000 : Infinity
  return (
    <ExternalLeaguePage
      league={league}
      rounds={cup ? rounds : undefined}
      groups={fromApi ?? [own.rows.map((r) => ({ ...r, logo: r.logo ?? logoFor(r.name) }))]}
      source={fromApi ? 'api-sports' : 'scoreline'}
      baseline={fromApi ? undefined : baseline}
      matches={own.matches}
      since={own.since}
      recent={(cup ? own.recent.filter((m) => m.date.getTime() < firstKept) : own.recent).map((m) => ({ ...m, homeLogo: m.homeLogo ?? logoFor(m.home), awayLogo: m.awayLogo ?? logoFor(m.away) }))}
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
  // The league's ten latest results, newest first
  const results = allFixtures()
    .filter((f) => f.division?.id === division.id && isFinished(f) && f.kickoff.getTime() <= now)
    .slice(-10)
    .reverse()
    .map((f) => toMatch(f, now))
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

        {results.length > 0 && (
          <section className="league">
            <header className="league__header">
              <div className="league__toggle">
                <span className="league__titles">
                  <h2 className="league__name">Seneste resultater</h2>
                </span>
              </div>
            </header>
            <ul className="league__matches">
              {results.map((m) => (
                <MatchRow key={m.id} match={m} showDate />
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

/** API-Sports' round names in Danish ("Quarter-finals" -> "Kvartfinaler", "3rd Round" -> "3. runde") */
function roundLabel(round?: string): string {
  if (!round) return 'Øvrige kampe'
  const r = round.toLowerCase()
  if (/semi/.test(r)) return 'Semifinaler'
  if (/quarter/.test(r)) return 'Kvartfinaler'
  const part = r.match(/1\/(\d+)/)?.[1]
  if (part) return `1/${part}-finaler`
  const last = r.match(/round of (\d+)/)?.[1]
  if (last) return `Sidste ${last}`
  if (/final/.test(r) && !/\d/.test(r)) return 'Finale'
  const n = r.match(/(\d+)/)?.[1]
  if (n && /round|runde/.test(r)) return `${n}. runde`
  return round
}
