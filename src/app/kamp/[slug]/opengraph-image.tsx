import { OG_SIZE, logoData, ogImage, type OgSide } from '../../../lib/ogImage'
import { findMatch } from '../../../data/matches'
import { teamByName } from '../../../data/teams'
import { getBadges } from '../../../lib/badges'
import { dateFromMatchSlug } from '../../../lib/slug'
import { formatFull, formatTime } from '../../../lib/time'
import type { Team } from '../../../types'

export const dynamic = 'force-dynamic'
export const alt = 'Kampen på Matchly'
export const size = OG_SIZE
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug
  const date = dateFromMatchSlug(slug)
  const match = date ? findMatch(slug, date, Date.now()) : undefined
  if (!match) return ogImage({ title: 'Kampen findes ikke' })
  const badges = await getBadges()
  const side = async (t: Team): Promise<OgSide> => ({ name: t.name, colors: t.colors, logo: await logoData(t.badge ?? badges[t.name] ?? teamByName(t.name)?.logo) })
  const [home, away] = await Promise.all([side(match.home), side(match.away)])
  const center = match.state === 'upcoming' ? formatTime(match.kickoff) : `${match.home.score ?? 0}–${match.away.score ?? 0}`
  const when = match.state === 'live' ? 'Live nu' : match.state === 'finished' ? `Slut · ${formatFull(match.kickoff)}` : formatFull(match.kickoff)
  return ogImage({ label: match.league, title: `${match.home.name} – ${match.away.name}`, sub: when, match: { home, away, center } })
}
