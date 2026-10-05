import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { tvLeagues, tvMatches } from '../../../lib/tv'
import { TvAdFallback, TvLeagueLinks, TvMatches, tvAdPlans } from '../../../components/TvGuide'
import { JsonLd, breadcrumbLd, matchListLd, webPageLd } from '../../../lib/jsonld'
import { paths } from '../../../lib/site'


// One league's coming matches on TV (the next four weeks), with the channels:
// "Superliga i TV", "Champions League i TV".

export const dynamic = 'force-dynamic'
type Params = Promise<{ liga: string }>
const DAYS = 28

const leagueOf = (slug: string) => tvLeagues().find((l) => l.slug === slug)

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const league = leagueOf((await params).liga)
  if (!league) return { title: 'Turneringen findes ikke' }
  const count = tvMatches(DAYS, Date.now(), league.slug).length
  return {
    title: `${league.name} i TV – kampe og kanaler`,
    description: `${count ? `De næste ${count} kampe` : 'Kampene'} i ${league.name} i TV med dato, tidspunkt og kanal. Se hvor du kan se ${league.name} i TV.`,
    alternates: { canonical: paths.tv(league.slug) },
    ...(count === 0 && { robots: { index: false, follow: true } }),
  }
}

export default async function TvLeaguePage({ params }: { params: Params }) {
  const league = leagueOf((await params).liga)
  if (!league) notFound()
  const now = Date.now()
  const matches = tvMatches(DAYS, now, league.slug)
  const title = `${league.name} i TV`
  const plans = tvAdPlans([matches])
  return (
    <div className="page">
      <JsonLd
        data={breadcrumbLd([
          { name: 'Forside', path: '/' },
          { name: 'Fodbold i TV', path: paths.tv() },
          { name: title, path: paths.tv(league.slug) },
        ])}
      />
      <JsonLd data={webPageLd(paths.tv(league.slug), title, new Date(now))} />
      <JsonLd data={matchListLd(title, matches)} />
      <div className="clubs">
        <div className="clubs__head">
          <h1 className="feed__title">{title}</h1>
          <p className="lead">
            De kommende kampe i <Link href={paths.league(league.slug)}>{league.name}</Link> i TV de næste fire uger, med dato, tidspunkt og kanal.
          </p>
        </div>
        <TvMatches matches={matches} showDate empty={`Vi kender ikke til kampe i ${league.name} i TV de næste fire uger.`} ads={plans[0]} />
        <TvAdFallback plans={plans} />
        <TvLeagueLinks leagues={tvLeagues()} current={league.slug} />
      </div>
    </div>
  )
}
