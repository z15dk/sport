import { OG_SIZE, logoData, ogImage } from '../../../lib/ogImage'
import { divisionBySlug, seasonOf } from '../../../data/leagues'
import { getBadges } from '../../../lib/badges'
import { knownLeague } from '../../../lib/knownLeague'
import { loadRealData } from '../../../lib/realdata'
import { sameLeagueKeys } from '../../../data/baselines'

export const dynamic = 'force-dynamic'
export const alt = 'Turneringen på Matchly'
export const size = OG_SIZE
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug
  const division = divisionBySlug(slug)
  if (division) {
    const logo = await logoData((await getBadges())[division.name])
    return ogImage({ label: seasonOf(division), title: division.name, sub: 'Stilling, resultater og kampprogram', team: { name: division.name, logo } })
  }
  const league = slug.startsWith('x-') ? knownLeague(slug) : undefined
  if (!league) return ogImage({ title: 'Turneringen findes ikke' })
  const names = loadRealData()?.leagueNames
  const name = sameLeagueKeys(slug).map((k) => names?.[k]).find(Boolean) ?? league.title ?? league.name
  return ogImage({ title: name, sub: 'Resultater og kampprogram', team: { name, logo: await logoData(league.logo) } })
}
