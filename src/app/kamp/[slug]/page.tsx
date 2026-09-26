import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { MatchView } from '../../../components/MatchView'
import { findExternalGame, findMatch } from '../../../data/matches'
import { realLogo } from '../../../lib/logoCheck'
import { cupOfGame } from '../../../data/cups'
import { apiHeadToHead, apiMatchEvents, apiMatchStats, apiMatchExtra, observedGoals, teamLogos } from '../../../lib/apisports'
import type { PastMatch } from '../../../data/matchInsights'
import type { H2hSource } from '../../../components/MatchView'
import { clubStats, findClub } from '../../../data/matchInsights'
import { archiveGameExtras, realHeadToHead } from '../../../lib/history'
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

function load(slug: string) {
  const date = dateFromMatchSlug(slug)
  const now = Date.now()
  const match = date ? findMatch(slug, date, now) : undefined
  return match && date ? { match, date, now } : undefined
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const found = load((await params).slug)
  if (!found) return { title: 'Kampen findes ikke' }
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

export default async function MatchPage({ params }: { params: Params }) {
  const { slug } = await params
  const found = load(slug)
  if (!found) notFound()
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
  const external = findExternalGame(match)
  const game = external && !external.id.startsWith('db-') ? external : undefined
  // Facts, form and table from API-Sports; our own season statistics cover our leagues' clubs
  const fromApi = game ? await apiMatchExtra(game).catch(() => undefined) : undefined
  // What API-Sports can't give (the free plan), from the games our statistics bank has saved
  const saved = game ? archiveGameExtras(game) : undefined
  // Goals and cards for the timeline, when our own sources don't have them
  const fromEvents = game && !match.incidents?.length ? await apiMatchEvents(game).catch(() => undefined) : undefined
  // No source gives the goals: the ones seen from the score changing (approximate minutes)
  const events = fromEvents?.length ? fromEvents : game && !match.incidents?.length ? observedGoals(game) : undefined
  // Shots, possession and expected goals (API-Sports' paid plan)
  const stats = game ? await apiMatchStats(game, match.incidents?.length ? match.incidents : fromEvents).catch(() => undefined) : undefined
  // Our own table has API-Sports' team names but no logos: from the games they have sent
  const logos = teamLogos()
  const savedTable = saved?.table && { ...saved.table, rows: saved.table.rows.map((r) => ({ ...r, logo: r.logo ?? logos.get(r.name) })) }
  // A cup has rounds, not a table
  const cup = !!(external && cupOfGame(external))
  const extra = fromApi && {
    ...fromApi,
    form: fromApi.form ?? saved?.form,
    table: cup ? undefined : (fromApi.table ?? savedTable),
  }
  if ((dbH2h?.length ?? 0) < 5) {
    const games = game ? await apiHeadToHead(game).catch(() => undefined) : undefined
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
      <JsonLd data={webPageLd(paths.match(match.slug), title, new Date(now), summary(match, homeStats, awayStats))} />
      <JsonLd data={faqLd(faq)} />
      <MatchView slug={slug} date={date} initialNow={now} realH2h={realH2h} h2hSource={h2hSource} extra={extra} events={events} stats={stats} cup={cup} />
      <div className="match-page match-page--after">
        <AdSlot placement="content" />
        <Faq items={faq} />
      </div>
    </div>
  )
}
