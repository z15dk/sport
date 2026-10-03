import { adminDenied, isAdmin } from '../../../../lib/admin'
import { getBadges } from '../../../../lib/badges'
import { makeVsGraphic } from '../../../../lib/vsGraphic'

// The VS graphic maker in the article editor: GET the clubs with a logo (for the pickers), POST makes
// the graphic and answers its upload's address.

export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: 'Log ind' }, { status: 401 })
  const names = Object.keys(await getBadges()).sort((x, y) => x.localeCompare(y, 'da'))
  return Response.json({ clubs: names })
}

export async function POST(request: Request) {
  const denied = await adminDenied(request)
  if (denied) return Response.json({ error: denied }, { status: 401 })
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const s = (k: string, max = 200) => (typeof b[k] === 'string' ? (b[k] as string).slice(0, max) : '')
  try {
    return Response.json(await makeVsGraphic({ home: s('home'), away: s('away'), top: s('top', 120), bg: s('bg', 300) || undefined }))
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 })
  }
}
