import { isAdmin } from '../../../../../lib/admin'
import { clubGraphicPng, leagueGraphicPng, resultGraphicPng, textGraphicPng, vsGraphicPng } from '../../../../../lib/vsGraphic'

export const dynamic = 'force-dynamic'

/** The VS graphic as it will look (PNG), for the live preview in the article editor: ?h=&a=&top=&bg= (or ?tekst=&top=&under=&bg= for a text picture, ?klub= for one club, ?liga= for a league, &boks=0 without the light card behind its logo) */
export async function GET(request: Request) {
  if (!(await isAdmin())) return new Response('Log ind', { status: 401 })
  const q = new URL(request.url).searchParams
  const s = (k: string, max = 200) => (q.get(k) ?? '').slice(0, max)
  try {
    // ?resultat=2-1&h=&a=&top=&hm=Navn 25',Navn 81'&am=… : the match report's result graphic
    const score = /^(\d+)-(\d+)$/.exec(s('resultat', 10))
    const goals = (k: string) => s(k, 400).split(',').map((x) => x.trim()).filter(Boolean)
    const png = score ? await resultGraphicPng({ home: s('h'), away: s('a'), hs: Number(score[1]), as: Number(score[2]), top: s('top', 120) || undefined, homeGoals: goals('hm'), awayGoals: goals('am') }) : s('tekst') ? await textGraphicPng({ title: s('tekst', 120), top: s('top', 80) || undefined, sub: s('under', 140) || undefined, bg: s('bg', 300) || undefined }): s('liga') ? await leagueGraphicPng({ league: s('liga'), card: s('boks') !== '0' }) : s('klub') ? await clubGraphicPng({ club: s('klub') }) : await vsGraphicPng({ home: s('h'), away: s('a'), top: s('top', 120), bg: s('bg', 300) || undefined })
    return new Response(new Uint8Array(png), { headers: { 'content-type': 'image/png', 'cache-control': 'private, no-store' } })
  } catch (e) {
    return new Response(e instanceof Error ? e.message : String(e), { status: 400 })
  }
}
