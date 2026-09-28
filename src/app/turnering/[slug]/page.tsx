import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { DIVISIONS, divisionBySlug, seasonOf, sportOf } from '../../../data/leagues'
import { hasRealData } from '../../../data/real'
import { allFixtures, isFinished, standings, toMatch } from '../../../data/season'
import { externalMatch, getMatches } from '../../../data/matches'
import { DivisionTabs } from '../../../components/DivisionTabs'
import { MatchRow } from '../../../components/MatchRow'
import { LiveNow } from '../../../components/LiveNow'
import { RoundResults, roundsOf } from '../../../components/RoundResults'
import { TeamBadge } from '../../../components/TeamBadge'
import { NewsList } from '../../../components/NewsList'
import { newsFor, newsMentioning } from '../../../lib/news'
import { allTeams, womenOf } from '../../../data/teams'
import { StandingsTable } from '../../../components/StandingsTable'
import { JsonLd, breadcrumbLd, faqLd, leagueLd, webPageLd } from '../../../lib/jsonld'
import { getBadges } from '../../../lib/badges'
import { Faq } from '../../../components/Faq'
import { AdSlot } from '../../../components/AdSlot'
import { LeagueStats } from '../../../components/LeagueStats'
import { LeagueLeaders } from '../../../components/LeagueLeaders'
import { LeagueHistory } from '../../../components/LeagueHistory'
import { leagueHistory, pastSeasons } from '../../../lib/history'
import { SeasonLinks } from '../../../components/SeasonLinks'
import { Updated } from '../../../components/Updated'
import { CalendarButton } from '../../../components/CalendarButton'
import { leagueFaq } from '../../../lib/faq'
import { formatLong, isoDate } from '../../../lib/time'
import { paths } from '../../../lib/site'
import { ExternalLeaguePage } from '../../../components/ExternalLeaguePage'
import { apiLeagueIdOf, apiLeagueLeaders, apiLeagueTable, teamLogos } from '../../../lib/apisports'
import { archiveLeagueTable, archiveSeasonGames } from '../../../lib/history'
import { archiveIncidents } from '../../../lib/archive'
import { gameStats, type StatGame, type StatTeam } from '../../../data/stats'
import { BASELINES, sameLeagueKeys } from '../../../data/baselines'
import { customLogoUrl } from '../../../lib/customLogos'
import { alike, normalize } from '../../../data/aliases'
import { getRealData } from '../../../data/real'
import { danishRound, externalLeagueKey } from '../../../data/external'
import { cupOfGame, wholeSeason } from '../../../data/cups'
import type { Match } from '../../../types'
import { loadRealData } from '../../../lib/realdata'
import { knownLeague } from '../../../lib/knownLeague'

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
    const name = sameLeagueKeys(slug).map((k) => names?.[k]).find(Boolean) ?? league.title ?? cup?.name ?? league.name
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
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

async function externalLeaguePage(slug: string) {
  const found = knownLeague(slug)
  if (!found) notFound()
  // A cup under a sponsor's name: its page is under the cup's own key
  const cupKey = cupOfGame({ sport: found.sport, league: found }) && externalLeagueKey({ ...found, originalName: cupOfGame({ sport: found.sport, league: found })!.key })
  if (cupKey && cupKey !== slug) permanentRedirect(paths.league(cupKey))
  const now = Date.now()
  const real = loadRealData() ?? getRealData()
  const keys = sameLeagueKeys(slug)
  const league = {
    ...found,
    name: keys.map((k) => real?.leagueNames?.[k]).find(Boolean) ?? found.title ?? cupOfGame({ sport: found.sport, league: found })?.name ?? found.name,
    logo: keys.map((k) => customLogoUrl(`liga-${k}`)).find(Boolean) ?? found.logo,
  }
  const cup = cupOfGame({ sport: found.sport, league: found })
  // Friendlies: no table (the games have nothing to do with each other), results by day instead
  const friendly = /friendl/i.test(`${found.name} ${found.title ?? ''}`)
  const fromApi = found.id && !cup && !friendly ? await apiLeagueTable(found) : undefined
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
  // A cup or a tournament with groups and knock-out rounds (Champions League): its rounds, newest first, and no table of our own
  const tournament = !!cup || friendly || wholeSeason({ sport: found.sport, league: found })
  const played = tournament ? games.filter((g) => g.state === 'finished').sort((a, b) => b.kickoff.localeCompare(a.kickoff)) : []
  const rounds: { name: string; matches: Match[] }[] = []
  for (const g of played) {
    const name = friendly ? capitalize(formatLong(isoDate(new Date(g.kickoff)))) : (danishRound(g.round) ?? 'Øvrige kampe')
    const round = rounds.find((r) => r.name === name) ?? (rounds.push({ name, matches: [] }), rounds.at(-1)!)
    round.matches.push(externalMatch(g))
  }
  const leaders = found.api.startsWith('football') && found.id && found.id !== 'db' ? await apiLeagueLeaders(found.id).catch(() => undefined) : undefined
  const firstKept = played.at(-1) ? Date.parse(played.at(-1)!.kickoff) - 86_400_000 : Infinity
  // The season's statistics: the statistics bank's matches (with their goals and cards), and the fetched days' games on top
  const archived = found.id && found.id !== 'db' ? archiveSeasonGames(`ext-${found.api.split('-')[0]}-${found.id}`) : []
  const archivedIncidents = archiveIncidents(archived.map((a) => a.id))
  const team = (name: string, logo?: string): StatTeam => ({ id: normalize(name) || name, name, logo: logo ?? logoFor(name) })
  const statGames = new Map<string, StatGame>()
  for (const a of archived) {
    statGames.set(a.id, { home: team(a.homeName), away: team(a.awayName), score: [a.homeScore, a.awayScore], ht: a.ht, incidents: archivedIncidents.get(a.id), spectators: a.spectators, kickoff: a.date })
  }
  const seasonFrom = archived[0] ? archived[0].date.getTime() - 86_400_000 : 0
  for (const g of games) {
    if (g.state !== 'finished' || g.homeScore === undefined || g.awayScore === undefined || Date.parse(g.kickoff) < seasonFrom) continue
    const m = externalMatch(g)
    statGames.set(g.id, {
      home: team(m.home.name, m.home.badge),
      away: team(m.away.name, m.away.badge),
      score: [g.homeScore, g.awayScore],
      ht: g.ht ?? statGames.get(g.id)?.ht,
      incidents: g.incidents?.length ? g.incidents : statGames.get(g.id)?.incidents,
      kickoff: new Date(g.kickoff),
      slug: m.slug,
    })
  }
  const stats = gameStats([...statGames.values()])
  // News: articles naming the tournament; for a women's league also those about its teams
  const allNames = [league.name, found.name, found.title, cup?.name, cup?.key].filter((x): x is string => !!x)
  const womenLeague = allNames.some((n) => /women|kvind|frauen|a-liga|damallsvenskan|toppserien|\bwsl\b|liga f\b/i.test(n))
  const inLeague = womenLeague ? allTeams().filter((t) => t.leagueSlug && keys.includes(t.leagueSlug)) : []
  const womenTeams = new Map(inLeague.map((t) => [womenOf(t), t] as const).filter((x): x is [string, (typeof inLeague)[number]] => !!x[0]))
  const newsNames = [
    ...allNames,
    ...(cup ? ['Pokal', 'Pokalturnering', 'Pokalfinale', 'Pokalkamp', 'Landspokalturnering'] : []),
    ...(womenLeague && found.country === 'Denmark' && !tournament ? ['Kvindeliga', 'Gjensidige Kvindeliga', 'A-Liga'] : []),
  ]
  const news = newsMentioning({ names: newsNames, clubs: [...womenTeams.keys()], women: womenLeague })
  const newsBadges = Object.fromEntries(
    news.flatMap((a) => {
      const t = a.clubs.map((c) => womenTeams.get(c)).find(Boolean)
      return t ? [[`${a.feed}|${a.id}`, { name: t.name, logo: t.logo ?? logoFor(t.name), colors: t.colors }]] : []
    }),
  )
  return (
    <ExternalLeaguePage
      league={league}
      rounds={tournament ? rounds : undefined}
      leaders={leaders}
      groups={fromApi ?? (tournament ? [] : [own.rows.map((r) => ({ ...r, logo: r.logo ?? logoFor(r.name) }))])}
      source={fromApi ? 'api-sports' : 'scoreline'}
      baseline={fromApi ? undefined : baseline}
      matches={own.matches}
      since={own.since}
      recent={(tournament ? own.recent.filter((m) => m.date.getTime() < firstKept) : own.recent).map((m) => ({ ...m, homeLogo: m.homeLogo ?? logoFor(m.home), awayLogo: m.awayLogo ?? logoFor(m.away) }))}
      upcoming={upcoming}
      stats={stats}
      now={now}
      news={news.length ? <NewsList articles={news} badges={newsBadges} fallback={{ name: league.name, logo: league.logo }} /> : undefined}
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
  // Top scorers, assists and cards (API-Sports, football)
  const leagueId = sportOf(division) === 'soccer' ? apiLeagueIdOf(division.id) : undefined
  const leaders = leagueId ? await apiLeagueLeaders(leagueId).catch(() => undefined) : undefined
  // The league's ten latest results, newest first
  const results = allFixtures()
    .filter((f) => f.division?.id === division.id && isFinished(f) && f.kickoff.getTime() <= now)
    .slice(-10)
    .reverse()
    .map((f) => toMatch(f, now))
  // The matches by round, when the sources give round numbers (else the ten latest results)
  const byRound = roundsOf(division, now)
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
        <CalendarButton kind="turnering" slug={division.slug} name={division.name} />
        <LiveNow matches={todays} />

        <div className={leaders ? 'table-duo' : 'table-solo'}>
        <div className="table-duo__main">
        <section className="panel table-panel">
          <header className="table-panel__head">
            <h2 className="panel__title">Stilling</h2>
          </header>
          <StandingsTable division={division} rows={rows} />
        </section>
        <LeagueStats division={division} />
        <NewsList articles={newsFor({ league: division.id }, 10)} division={division} />
        {/* The rounds under the statistics, beside the players */}
        {byRound ? (
          <RoundResults rounds={byRound} now={now} />
        ) : results.length > 0 && (
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
        </div>
        {leaders && <LeagueLeaders leaders={leaders} league={division.name} />}
        </div>
        {(() => {
          // Not on the Danish leagues' pages: their history in our data is too incomplete (and mixes in second teams)
          if (division.countryCode === 'DK') return null
          const history = leagueHistory(division.id)
          return history ? <LeagueHistory name={division.name} history={history} /> : null
        })()}
        {(() => {
          // Earlier seasons with a page of their own (only those our partners' results cover in full)
          const seasons = pastSeasons(division.id)
          if (!seasons.length) return null
          return (
            <section className="panel">
              <h2 className="panel__title">Tidligere sæsoner</h2>
              <SeasonLinks divisionSlug={division.slug} seasons={seasons} />
            </section>
          )
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
