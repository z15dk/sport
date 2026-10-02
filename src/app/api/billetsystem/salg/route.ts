import { clubSales, matchSales } from '../../../../lib/ticketShop'

export const dynamic = 'force-dynamic'

// The club's live views, asked for every few seconds: one match (/billetsystem/demo/klub/<kamp>, ?kamp=)
// or the whole club (/billetsystem/demo/salg/<klub>, ?klub=<club id>)
export function GET(request: Request) {
  const q = new URL(request.url).searchParams
  const klub = q.get('klub')
  const data = klub ? clubSales(klub) : matchSales(q.get('kamp') ?? '')
  return Response.json(data ?? null, { headers: { 'Cache-Control': 'no-store' } })
}
