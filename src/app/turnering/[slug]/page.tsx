import type { Metadata } from 'next'
import { playerFaces } from '../../../lib/playerPhotos'
import { leagueDeep } from '../../../lib/leagueDeep'
import { leagueBrief } from '../../../data/leagueBrief'
import { leagueStats } from '../../../data/stats'
import { AttackDefenceBox, FormTableBox, LeagueBriefBox, LeagueHero, LeagueOutBox, LeaguePlayersBox } from '../../../components/league/LeagueDeepBoxes'
import { forVisitor } from '../../../lib/visitorBudget'
import { notFound, permanentRedirect } from 'next/navigation'
import { DIVISIONS, danishTier, divisionBySlug, seasonOf, sportOf } from '../../../data/leagues'
import { hasRealData } from '../../../data/real'
import { allFixtures, clubInDivision, isFinished, positionsByRound, standings, toMatch } from '../../../data/season'
import { externalMatch, getMatches, isFriendly } from '../../../data/matches'
import { DivisionTabs } from '../../../components/DivisionTabs'
import { MatchRow } from '../../../components/MatchRow'
import { LiveNow } from '../../../components/LiveNow'
import { RoundResults, roundsOf } from '../../../components/RoundResults'
import { NewsList } from '../../../components/NewsList'
import { TaggedArticles } from '../../../components/TaggedArticles'
import { articlesAbout } from '../../../lib/articleTopics'
import { newsFor, newsMentioning } from '../../../lib/news'
import { allTeams, womenOf } from '../../../data/teams'
import { StandingsTable } from '../../../components/StandingsTable'
import { WidgetPromo } from '../../../components/WidgetPromo'
import { TopScorersList } from '../../../components/TopScorersList'
import { dbuTopScorers } from '../../../lib/dbuLineups'
import { JsonLd, breadcrumbLd, leagueLd, webPageLd } from '../../../lib/jsonld'
import { getBadges } from '../../../lib/badges'
import { Faq } from '../../../components/Faq'
import { AdSlot } from '../../../components/AdSlot'
import { LeagueStats } from '../../../components/LeagueStats'
import { LeagueLeaders } from '../../../components/LeagueLeaders'
import { LeagueHistory } from '../../../components/LeagueHistory'
import { leagueHistory, pastSeasons } from '../../../lib/history'
import { SeasonLinks } from '../../../components/SeasonLinks'
import { AboutText } from '../../../components/AboutText'
import { leagueAbout } from '../../../lib/seoText'
import { Updated } from '../../../components/Updated'
import { CalendarButton } from '../../../components/CalendarButton'
import { leagueFaq } from '../../../lib/faq'
import { formatLong, isoDate } from '../../../lib/time'
import { paths } from '../../../lib/site'
import { ExternalLeaguePage } from '../../../components/ExternalLeaguePage'
import { buildBracket, isKnockout, type BracketGame } from '../../../lib/bracket'
import { matchSlug } from '../../../lib/slug'
import { apiLeagueIdOf, apiLeagueLeaders, apiLeagueTable, externalLeague, teamLogos } from '../../../lib/apisports'
import { archiveLeagueTable, archiveSeasonGames } from '../../../lib/history'
import { archiveIncidents } from '../../../lib/archive'
import { gameStats, type StatGame, type StatTeam } from '../../../data/stats'
import { BASELINES, sameLeagueKeys } from '../../../data/baselines'
import { customLogoUrl } from '../../../lib/customLogos'
import { alike, normalize } from '../../../data/aliases'
import { getRealData } from '../../../data/real'
import { danishLeagueName, danishRound, externalLeagueKey } from '../../../data/external'
import { shownTeam } from '../../../data/countries'
import { cupOfGame, wholeSeason } from '../../../data/cups'
import type { Match } from '../../../types'
import { loadRealData } from '../../../lib/realdata'
import { knownLeague } from '../../../lib/knownLeague'
import { divisionOfGame } from '../../../data/ourLeagues'
import { LeagueSubNav } from '../../../components/LeagueSubPage'
import { TableShift } from '../../../components/TableShift'

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
    const name = sameLeagueKeys(slug).map((k) => names?.[k]).find(Boolean) ?? league.title ?? cup?.name ?? danishLeagueName(league.name, league.country) ?? league.name
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
  const tier = sportOf(division) === 'soccer' ? danishTier(division) : undefined
  return {
    title: `${division.name} ${seasonOf(division)} – stilling, resultater og kampprogram`,
    description: `${tier ? `${division.name} er Danmarks ${tier.words} fodboldrække. ` : ''}Stillingen i ${division.name} ${seasonOf(division)} efter ${rounds} runder: ${leader.club.name} fører med ${leader.points} point. Alle ${division.clubs.length} klubber, resultater, kampprogram og topscorere.`,
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
  // One of our own leagues under another source's name ("x-denmark-metal-ligaen"): its page is ours
  const ownGame = (loadRealData() ?? getRealData())?.external?.find((g) => externalLeagueKey(g.league) === slug && divisionOfGame(g))
  const ownDivision = ownGame && divisionOfGame(ownGame)
  if (ownDivision) permanentRedirect(paths.league(ownDivision.d.slug))
  const now = Date.now()
  const real = loadRealData() ?? getRealData()
  const keys = sameLeagueKeys(slug)
  const league = {
    ...found,
    name: keys.map((k) => real?.leagueNames?.[k]).find(Boolean) ?? found.title ?? cupOfGame({ sport: found.sport, league: found })?.name ?? danishLeagueName(found.name, found.country) ?? found.name,
    logo: keys.map((k) => customLogoUrl(`liga-${k}`)).find(Boolean) ?? found.logo,
  }
  const cup = cupOfGame({ sport: found.sport, league: found })
  // Friendlies: no table (the games have nothing to do with each other), results by day instead
  const friendly = isFriendly(`${found.name} ${found.title ?? ''}`)
  const fromApi = found.id && !cup && !friendly ? await apiLeagueTable(found) : undefined
  const baseline = BASELINES[slug]
  // The saved matches under every id the source lists the league under (the A-Liga is also "Kvindeliga")
  const divisionIds = [
    ...new Set(
      [found, ...keys.map(externalLeague)]
        .filter((l): l is NonNullable<typeof l> => !!l?.id && l.id !== 'db')
        .map((l) => `ext-${l.api.split('-')[0]}-${l.id}`),
    ),
  ]
  const own = archiveLeagueTable(divisionIds, baseline)
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
  const archived = divisionIds.length ? archiveSeasonGames(divisionIds) : []
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
  // A knock-out tournament (the women's Europa Cup): a bracket of its ties, never a table
  const bracketGames = new Map<string, BracketGame>()
  for (const a of archived) {
    bracketGames.set(a.id, {
      id: a.id,
      round: a.round,
      date: a.date.getTime(),
      home: { name: a.homeName, logo: logoFor(a.homeName) },
      away: { name: a.awayName, logo: logoFor(a.awayName) },
      homeScore: a.homeScore,
      awayScore: a.awayScore,
      finished: true,
      slug: matchSlug(a.homeName, a.awayName, isoDate(a.date)),
    })
  }
  for (const g of games) {
    if (g.state === 'postponed' || Date.parse(g.kickoff) < seasonFrom) continue
    bracketGames.set(g.id, {
      id: g.id,
      round: g.round,
      date: Date.parse(g.kickoff),
      home: { name: g.home.name, logo: g.home.logo ?? logoFor(g.home.name) },
      away: { name: g.away.name, logo: g.away.logo ?? logoFor(g.away.name) },
      homeScore: g.homeScore,
      awayScore: g.awayScore,
      finished: g.state === 'finished',
      slug: externalMatch(g).slug,
    })
  }
  const knockout = !cup && !friendly && !wholeSeason({ sport: found.sport, league: found }) && !fromApi && isKnockout([...bracketGames.values()].map((g) => g.round))
  const bracket = knockout ? buildBracket([...bracketGames.values()]) : undefined
  // Not from a handful of matches ("100 % home wins" after one match says nothing)
  const stats = statGames.size >= 5 ? gameStats([...statGames.values()]) : undefined
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
      rounds={tournament ? rounds : knockout ? [] : undefined}
      bracket={bracket}
      leaders={leaders}
      groups={fromApi ?? (tournament || knockout ? [] : [own.rows.map((r) => ({ ...r, name: shownTeam(r.name, league.country), logo: r.logo ?? logoFor(r.name) }))])}
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

async function LeaguePageInner({ params }: { params: Params }) {
  const slug = (await params).slug
  if (slug.startsWith('x-')) return externalLeaguePage(slug)
  const division = divisionBySlug(slug)
  // Leagues without real fixtures are not shown
  if (!division || !hasRealData(division.id)) notFound()
  const now = Date.now()
  const rows = standings(division, now)
  const badges = await getBadges()
  const today = isoDate(now)
  const todays = getMatches(today, sportOf(division), now)
    .filter((m) => m.leagueSlug === division.slug)
    .sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime())
  // Top scorers, assists and cards (API-Sports, football)
  const leagueId = sportOf(division) === 'soccer' ? apiLeagueIdOf(division.id) : undefined
  // 1., 2. and 3. division: counted from the season's match pages, which have every goal (our other sources have few or none),
  // so they replace the other player lists as soon as there are any
  const dbuScorers = dbuTopScorers(division.slug, (team) => clubInDivision(division, team, getRealData()?.clubNames ?? {})?.name)
  const useDbu = !!dbuScorers?.scorers.length
  const leaders = leagueId && !useDbu ? await apiLeagueLeaders(leagueId).catch(() => undefined) : undefined
  // The league's ten latest results, newest first
  const results = allFixtures()
    .filter((f) => f.division?.id === division.id && isFinished(f) && f.kickoff.getTime() <= now)
    .slice(-10)
    .reverse()
    .map((f) => toMatch(f, now))
  // The matches by round, when the sources give round numbers (else the ten latest results)
  const byRound = roundsOf(division, now)
  const faq = leagueFaq(division, rows)
  // The season at a glance, the players, who is out and where the season is (src/lib/leagueDeep.ts)
  const deep = await leagueDeep(division, now)
  const stats = leagueStats(division)
  const top = leaders?.scorers[0]
    ? { name: leaders.scorers[0].name, club: clubInDivision(division, leaders.scorers[0].team, getRealData()?.clubNames ?? {})?.name ?? leaders.scorers[0].team, goals: leaders.scorers[0].value }
    : dbuScorers?.scorers[0]
      ? { name: dbuScorers.scorers[0].name, club: dbuScorers.scorers[0].club ?? dbuScorers.scorers[0].team, goals: dbuScorers.scorers[0].goals }
      : stats?.scorers[0] && { name: stats.scorers[0].player, club: stats.scorers[0].club.name, goals: stats.scorers[0].goals }
  const brief = leagueBrief({ division, rows, stats, deep, topScorer: top })
  // The top scorer's photo for the top: the league's player list has it, else by name in the statistics bank (football)
  const topPhoto = leaders?.scorers[0]?.photo ?? (top && sportOf(division) === 'soccer' ? playerFaces([{ name: top.name, team: top.club }])[0]?.photo : undefined)

  return (
    <div className="page">
      <JsonLd data={leagueLd(division, badges[division.name])} />
      <JsonLd data={webPageLd(paths.league(division.slug), division.name, new Date(now))} />
      <JsonLd
        data={breadcrumbLd([
          { name: 'Turneringer', path: paths.league('superliga') },
          { name: division.name, path: paths.league(division.slug) },
        ])}
      />
      <div className="clubs">
        <div className="clubs__head">
          <LeagueHero division={division} rows={rows} stats={stats} deep={deep} badge={badges[division.name]} topScorer={top ? { ...top, photo: topPhoto } : undefined} />
          <DivisionTabs active={division.slug} />
          <LeagueSubNav division={division} active="stilling" />
        </div>

        <LeagueBriefBox items={brief} />
        <Updated at={now} />
        <CalendarButton kind="turnering" slug={division.slug} name={division.name} />
        <LiveNow matches={todays} />

        {/* 1., 2. and 3. division: top scorers counted from the match pages, beside the table (no other source has them) */}
        <div className={leaders || useDbu ? 'table-duo' : 'table-solo'}>
        <div className="table-duo__main">
        <section className="panel table-panel" id="stilling">
          <header className="table-panel__head">
            <h2 className="panel__title">Stilling</h2>
          </header>
          <StandingsTable division={division} rows={rows} />
        </section>
        <WidgetPromo
          wide
          title={[`${division.name}-tabellen`, 'på din side.']}
          text={`Sæt den aktuelle stilling i ${division.name} på din klub-, fan- eller blogside. Gratis, opdateres efter hver kamp.`}
          href={`/widget?liga=${division.slug}#lav`}
          cta="Lav din tabel →"
        />
        <LeagueStats division={division} leaders={leaders} />
        <FormTableBox rows={rows} />
        <AttackDefenceBox rows={rows} />
        <LeaguePlayersBox deep={deep} league={division.name} />
        <LeagueOutBox deep={deep} />
        <TaggedArticles articles={articlesAbout({ division })} title={`Artikler om ${division.name}`} />
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
        {useDbu && dbuScorers && <TopScorersList league={division.name} {...dbuScorers} />}
        </div>
        {(() => {
          // Tabelforskydning: each club's place round by round (only once a few rounds are played)
          const shift = positionsByRound(division)
          if (shift.rounds.length < 3) return null
          return (
            <TableShift
              league={division.name}
              rounds={shift.rounds}
              rows={shift.rows.map((r) => ({ name: r.club.name, color: r.club.colors[0], pos: r.pos }))}
              top={division.zones.top}
              topLabel={division.zones.topLabel}
              bottom={division.zones.bottom}
            />
          )
        })()}
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


        <AboutText
          title={`Om ${division.name}`}
          paragraphs={leagueAbout(division, now, { topScorer: dbuScorers?.scorers[0] ? { player: dbuScorers.scorers[0].name, club: dbuScorers.scorers[0].club, goals: dbuScorers.scorers[0].goals } : undefined })}
        />
        <AdSlot placement="content" />
        <Faq items={faq} />
      </div>
    </div>
  )
}

/** LeaguePage with the visitor's right to spend API calls (crawlers use what is saved: src/lib/visitorBudget.ts) */
export default async function LeaguePage(props: { params: Params }) {
  return forVisitor(() => LeaguePageInner(props))
}
