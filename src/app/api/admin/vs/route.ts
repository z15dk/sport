import { adminDenied, isAdmin } from '../../../../lib/admin'
import { getBadges } from '../../../../lib/badges'
import { leagueLogos, makeClubGraphic, makeLeagueGraphic, makeTextGraphic, makeVsGraphic } from '../../../../lib/vsGraphic'
import { nationalTeams } from '../../../../lib/nationalTeams'

// The VS graphic maker in the article editor: GET the clubs (and national teams) with a logo (for the pickers), POST makes
// the graphic (or, with "club", the one-club picture, with "league" the league picture, with "title" a text picture) and answers its upload's address.

export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: 'Log ind' }, { status: 401 })
  // Our clubs and leagues with a logo, and the national teams with their flags
  const names = [...new Set([...Object.keys(await getBadges()), ...Object.keys(nationalTeams())])].sort((x, y) => x.localeCompare(y, 'da'))
  const leagues = Object.keys(await leagueLogos()).sort((x, y) => x.localeCompare(y, 'da'))
  return Response.json({ clubs: names, leagues })
}

export async function POST(request: Request) {
  const denied = await adminDenied(request)
  if (denied) return Response.json({ error: denied }, { status: 401 })
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const s = (k: string, max = 200) => (typeof b[k] === 'string' ? (b[k] as string).slice(0, max) : '')
  try {
    // One club: only its logo on Matchly's dark top
    // A text picture: a headline in Matchly's design, with an optional line above and under it and a photo behind it
    if (s('title')) return Response.json(await makeTextGraphic({ title: s('title', 120), top: s('top', 80) || undefined, sub: s('sub', 140) || undefined, bg: s('bg', 300) || undefined }))
    if (s('league')) return Response.json(await makeLeagueGraphic({ league: s('league'), card: b.card !== false, bg: s('bg', 300) || undefined }))
    if (s('club')) return Response.json(await makeClubGraphic({ club: s('club'), bg: s('bg', 300) || undefined }))
    return Response.json(await makeVsGraphic({ home: s('home'), away: s('away'), top: s('top', 120), bg: s('bg', 300) || undefined }))
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 })
  }
}
