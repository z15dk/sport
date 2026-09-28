import { OG_SIZE, logoData, ogImage } from '../../../lib/ogImage'
import { teamBySlug } from '../../../data/teams'
import { getBadges } from '../../../lib/badges'

export const dynamic = 'force-dynamic'
export const alt = 'Klubben på Matchly'
export const size = OG_SIZE
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const team = teamBySlug((await params).slug)
  if (!team) return ogImage({ title: 'Klubben findes ikke' })
  const logo = await logoData(team.logo ?? (await getBadges())[team.name])
  return ogImage({
    label: team.league,
    title: team.name,
    sub: 'Resultater, kampprogram og stilling',
    team: { name: team.name, logo, colors: team.colors ?? team.season?.club.colors },
  })
}
