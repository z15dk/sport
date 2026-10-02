import { matchSales } from '../../../../lib/ticketShop'

export const dynamic = 'force-dynamic'

// The club's live view (/billetsystem/demo/klub/<kamp>): the match's sales, asked for every few seconds
export function GET(request: Request) {
  const kamp = new URL(request.url).searchParams.get('kamp') ?? ''
  return Response.json(matchSales(kamp) ?? null, { headers: { 'Cache-Control': 'no-store' } })
}
