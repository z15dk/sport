import { cache } from 'react'
import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { MatchView } from '../../../components/MatchView'
import { clubExternalGames, findExternalGame, findMatch, isFriendly, leagueGamesOn, namesOf } from '../../../data/matches'
import { RealDataExtra } from '../../../components/RealDataExtra'
import { realExtras } from '../../../lib/clientData'
import { realLogo } from '../../../lib/logoCheck'
import { cupOfGame, wholeSeason } from '../../../data/cups'
import { danishRound } from '../../../data/external'
import { apiGameFor, apiHeadToHead, apiInjuries, apiMatchEvents, apiMatchLineups, apiMatchStats, apiMatchExtra, observedGoals, teamLogos } from '../../../lib/apisports'
import type { PastMatch } from '../../../data/matchInsights'
import type { H2hSource } from '../../../components/MatchView'
import { clubStats, findClub } from '../../../data/matchInsights'
import { archiveGameExtras, pastMeetings, realHeadToHead, type PastGame } from '../../../lib/history'
import { findPastMatch } from '../../../lib/pastMatch'
import { eventPlayers } from '../../../lib/archive'
import { matchReport } from '../../../data/matchStory'
import { PastMatchView } from '../../../components/PastMatchView'
import type { Match } from '../../../types'
import { teamByName } from '../../../data/teams'
import { Faq } from '../../../components/Faq'
import { AdSlot } from '../../../components/AdSlot'
import { matchFaq } from '../../../lib/faq'
import { dateFromMatchSlug } from '../../../lib/slug'
import { summary } from '../../../lib/matchText'
import { formatFull, isoDate } from '../../../lib/time'
import { paths } from '../../../lib/site'
import { JsonLd, breadcrumbLd, faqLd, matchLd, webPageLd } from '../../../lib/jsonld'

export const dynamic = 'force-dynamic'

type Params = Promise<{ slug: string }>

/** The match, once per request (the metadata and the page both need it) */
const load = cache((slug: string) => {
  const date = dateFromMatchSlug(slug)
  const now = Date.now()
  const match = date ? findMatch(slug, date, now) : undefined
  return match && date ? { match, date, now } : undefined
})

/** An older match the live data no longer has (match database and statistics bank) */
const loadPast = cache((slug: string) => findPastMatch(slug))

async function pastMetadata(slug: string): Promise<Metadata> {
  const past = loadPast(slug)
  if (!past || !('game' in past)) return { title: 'Kampen findes ikke' }
  const { game: g, match } = past
  const title = `${g.home} – ${g.away} ${g.homeScore}-${g.awayScore} | ${g.tournament} ${formatFull(g.date)}`
  const result = g.homeScore === g.awayScore ? `endte ${g.homeScore}-${g.awayScore}` : `${g.homeScore > g.awayScore ? g.home : g.away} vandt ${Math.max(g.homeScore, g.awayScore)}-${Math.min(g.homeScore, g.awayScore)}`
  const description = `${g.home} mod ${g.away} i ${g.tournament} ${g.season} (${formatFull(g.date)}): ${result}.${match.incidents?.length ? ' Målscorere, kort' : ' Resultat'}, spillere og tidligere opgør mellem holdene.`
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: paths.match(g.slug) },
    openGraph: { title, description, type: 'article' },
  }
}

function PastMatchPage({ game: g, match }: { game: PastGame; match: Match }) {
  const now = Date.now()
  const h2h = pastMeetings(g)
  const teamPath = Object.fromEntries([g.home, g.away].map((n) => [n, teamByName(n) ? paths.club(teamByName(n)!.slug) : undefined]))
  const report = matchReport({ match, now, h2h })
  const players = g.source.archive ? eventPlayers(g.source.archive) : []
  const title = `${g.home} – ${g.away}`
  return (
    <div className="page">
      <JsonLd data={matchLd(match, (name) => teamByName(name)?.slug)} />
      <JsonLd
        data={breadcrumbLd([
          { name: 'Kampe', path: '/' },
          ...(match.leagueSlug ? [{ name: match.league, path: paths.league(match.leagueSlug) }] : []),
          { name: title, path: paths.match(g.slug) },
        ])}
      />
      <PastMatchView match={match} season={g.season} spectators={g.spectators} teamPath={teamPath} report={report} h2h={h2h} players={players} />
      <div className="match-page match-page--after">
        <AdSlot placement="content" />
      </div>
    </div>
  )
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const slug = (await params).slug
  const found = load(slug)
  if (!found) return pastMetadata(slug)
  const { match } = found
  const score =
    match.state === 'upcoming' ? '' : ` ${match.home.score ?? 0}-${match.away.score ?? 0}`
  const title = `${match.home.name} – ${match.away.name}${score} | ${match.league} ${formatFull(match.kickoff)}`
  const description = summary(match, clubStats(match.home.name, found.now), clubStats(match.away.name, found.now))
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: paths.match(match.slug) },
    openGraph: { title, description, type: 'article' },
  }
}

/** A lookup's answer, or nothing after a moment (the lookup goes on and its answer is cached for the next visit) */
function within<T>(p: Promise<T>, ms = 1500): Promise<T | undefined> {
  return Promise.race([p.catch(() => undefined), new Promise<undefined>((r) => setTimeout(() => r(undefined), ms))])
}

export default async function MatchPage({ params }: { params: Params }) {
  const { slug } = await params
  const found = load(slug)
  if (!found) {
    const past = loadPast(slug)
    if (!past) notFound()
    if ('redirect' in past) permanentRedirect(paths.match(past.redirect))
    return <PastMatchPage {...past} />
  }
  const { match, date, now } = found
  const clubSlug = (name: string) => teamByName(name)?.slug
  const homeStats = clubStats(match.home.name, now)
  const awayStats = clubStats(match.away.name, now)
  const homeClub = findClub(match.home.name)?.club
  const awayClub = findClub(match.away.name)?.club
  // Real meetings from the match database when both clubs are in it
  const dbH2h = homeClub && awayClub ? realHeadToHead(homeClub, awayClub, match.kickoff) : undefined
  // Topped up with API-Sports' meetings (cached, within a small daily budget) when the database has fewer than 5
  let realH2h = dbH2h
  let h2hSource: H2hSource | undefined = dbH2h ? 'database' : undefined
  // API-Sports' game (not one from our match database, which API-Sports can't look up)
  // Also older matches: API-Sports' whole season as the job has kept it
  const external = findExternalGame(match) ?? apiGameFor(match, { home: namesOf(match.home.name), away: namesOf(match.away.name) })
  const game = external && !external.id.startsWith('db-') ? external : undefined
  // API-Sports' lookups at once, and never more than a moment's wait: what isn't ready is cached for the next visit
  const [fromApi, fromEventsApi, lineups, h2hGames, injuries] = await Promise.all([
    game ? within(apiMatchExtra(game)) : undefined,
    game && !match.incidents?.length ? within(apiMatchEvents(game)) : undefined,
    game ? within(apiMatchLineups(game)) : undefined,
    game && (dbH2h?.length ?? 0) < 5 ? within(apiHeadToHead(game)) : undefined,
    game?.sport === 'soccer' && game.id.startsWith('football-') ? within(apiInjuries(String(game.league.id))) : undefined,
  ])
  // Injured and suspended players listed for this very match
  const fixtureId = game ? Number(game.id.split('-').pop()) : undefined
  const forMatch = injuries?.filter((i) => i.fixtureId === fixtureId) ?? []
  const absent = game && forMatch.length ? { home: forMatch.filter((i) => i.teamId === game.home.id), away: forMatch.filter((i) => i.teamId === game.away.id) } : undefined
  const fromEvents = fromEventsApi
  // What API-Sports can't give (the free plan), from the games our statistics bank has saved
  const saved = game ? archiveGameExtras(game) : undefined
  // No source gives the goals: the ones seen from the score changing (approximate minutes)
  const events = fromEvents?.length ? fromEvents : game && !match.incidents?.length ? observedGoals(game) : undefined
  // Shots, possession and expected goals (API-Sports' paid plan)
  const stats = game ? await within(apiMatchStats(game, match.incidents?.length ? match.incidents : fromEvents)) : undefined
  // Our own table has API-Sports' team names but no logos: from the games they have sent
  const logos = teamLogos()
  const savedTable = saved?.table && { ...saved.table, rows: saved.table.rows.map((r) => ({ ...r, logo: r.logo ?? logos.get(r.name) })) }
  // A cup has rounds, not a table
  const cup = !!(external && cupOfGame(external))
  // Our match database's cup games: at least the round (API-Sports' games bring more facts)
  const facts = fromApi ?? (external?.round ? { facts: [{ label: 'Runde', value: danishRound(external.round)! }] } : undefined)
  const extra = facts && {
    ...facts,
    form: facts.form ?? saved?.form,
    // A tournament with groups (Champions League): only API-Sports' table for the group, never one we compute
    table: cup || isFriendly(match.league) ? undefined : (facts.table ?? (external && wholeSeason(external) ? undefined : savedTable)),
  }
  if ((dbH2h?.length ?? 0) < 5) {
    const games = h2hGames
    if (game && games?.length) {
      const nameOf = (id?: number, fallback = '') =>
        id === game.home.id ? match.home.name : id === game.away.id ? match.away.name : fallback
      const fromApi = games.map(
        (g): PastMatch => ({
          date: new Date(g.kickoff),
          competition: g.league.name,
          home: nameOf(g.home.id, g.home.name),
          away: nameOf(g.away.id, g.away.name),
          homeScore: g.homeScore ?? 0,
          awayScore: g.awayScore ?? 0,
          homeLogo: realLogo(g.home.logo),
          awayLogo: realLogo(g.away.logo),
        }),
      )
      // The same meeting in both sources counts once (same day)
      const days = new Set((dbH2h ?? []).map((m) => isoDate(m.date)))
      const added = fromApi.filter((m) => !days.has(isoDate(m.date)))
      if (added.length) {
        realH2h = [...(dbH2h ?? []), ...added].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 5)
        h2hSource = dbH2h?.length ? 'both' : 'api-sports'
      }
    }
  }
  if (!realH2h?.length && saved?.h2h.length) {
    realH2h = saved.h2h
    h2hSource = 'database'
  }
  const faq = matchFaq(match, realH2h ?? [], homeStats, awayStats)
  const title = `${match.home.name} – ${match.away.name}`

  return (
    <div className="page">
      <JsonLd data={matchLd(match, clubSlug)} />
      <JsonLd
        data={breadcrumbLd([
          { name: 'Kampe', path: '/' },
          ...(match.leagueSlug ? [{ name: match.league, path: paths.league(match.leagueSlug) }] : []),
          { name: `${match.home.name} – ${match.away.name}`, path: paths.match(match.slug) },
        ])}
      />
      <JsonLd data={webPageLd(paths.match(match.slug), title, new Date(now), summary(match, homeStats, awayStats, extra?.table?.source === 'api-sports' ? extra.table.rows : undefined))} />
      <JsonLd data={faqLd(faq)} />
      <RealDataExtra
        {...realExtras(
          [...new Map([
            ...(external ? [external] : []),
            ...clubExternalGames(match.home.name),
            ...clubExternalGames(match.away.name),
            // A friendly shows the day's other friendlies instead of a table
            ...(isFriendly(match.league) ? leagueGamesOn(isoDate(match.kickoff), match.league, match.sport) : []),
          ].map((g) => [g.id, g])).values()],
          extra?.table && match.leagueSlug ? [{ leagueSlug: match.leagueSlug, names: extra.table.rows.map((r) => r.name), sport: match.sport }] : [],
        )}
      />
      <MatchView slug={slug} date={date} initialNow={now} realH2h={realH2h} h2hSource={h2hSource} extra={extra} events={events} stats={stats} cup={cup} lineups={lineups} absent={absent} />
      <div className="match-page match-page--after">
        <AdSlot placement="content" />
        <Faq items={faq} />
      </div>
    </div>
  )
}
