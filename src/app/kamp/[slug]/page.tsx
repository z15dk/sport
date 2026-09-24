import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { MatchView } from '../../../components/MatchView'
import { findMatch } from '../../../data/matches'
import { clubStats, findClub } from '../../../data/matchInsights'
import { dateFromMatchSlug } from '../../../lib/slug'
import { summary } from '../../../lib/matchText'
import { formatFull } from '../../../lib/time'
import { paths } from '../../../lib/site'
import { JsonLd, breadcrumbLd, matchLd } from '../../../lib/jsonld'

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
  const description = summary(match, clubStats(match.home.name), clubStats(match.away.name))
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
  const clubSlug = (name: string) => findClub(name)?.club.slug

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
      <MatchView slug={slug} date={date} initialNow={now} />
    </div>
  )
}
