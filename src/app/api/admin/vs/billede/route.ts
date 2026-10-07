import { isAdmin } from '../../../../../lib/admin'
import { clubGraphicPng, leagueGraphicPng, vsGraphicPng } from '../../../../../lib/vsGraphic'

export const dynamic = 'force-dynamic'

/** The VS graphic as it will look (PNG), for the live preview in the article editor: ?h=&a=&top=&bg= (or ?klub= for one club, ?liga= for a league) */
export async function GET(request: Request) {
  if (!(await isAdmin())) return new Response('Log ind', { status: 401 })
  const q = new URL(request.url).searchParams
  const s = (k: string, max = 200) => (q.get(k) ?? '').slice(0, max)
  try {
    const png = s('liga') ? await leagueGraphicPng({ league: s('liga') }) : s('klub') ? await clubGraphicPng({ club: s('klub') }) : await vsGraphicPng({ home: s('h'), away: s('a'), top: s('top', 120), bg: s('bg', 300) || undefined })
    return new Response(new Uint8Array(png), { headers: { 'content-type': 'image/png', 'cache-control': 'private, no-store' } })
  } catch (e) {
    return new Response(e instanceof Error ? e.message : String(e), { status: 400 })
  }
}
