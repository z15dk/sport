import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { MatchView } from '../../../components/MatchView'
import { findMatch } from '../../../data/matches'
import { clubStats, headToHead } from '../../../data/matchInsights'
import { teamByName } from '../../../data/teams'
import { Faq } from '../../../components/Faq'
import { matchFaq } from '../../../lib/faq'
import { dateFromMatchSlug } from '../../../lib/slug'
import { summary } from '../../../lib/matchText'
import { formatFull } from '../../../lib/time'
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
  const faq = matchFaq(match, headToHead(match.home.name, match.away.name, match.kickoff), homeStats, awayStats)
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
      <MatchView slug={slug} date={date} initialNow={now} />
      <div className="match-page match-page--after">
        <Faq items={faq} />
      </div>
    </div>
  )
}
