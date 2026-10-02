import { scanTicket } from '../../../../lib/ticketShop'

// The gate's scanner (/billetsystem/demo/scanner): JSON { code, kamp? } -> valid / used / other match / invalid
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { code?: unknown; kamp?: unknown }
  const code = typeof body.code === 'string' ? body.code.slice(0, 120) : ''
  const kamp = typeof body.kamp === 'string' && body.kamp ? body.kamp : undefined
  return Response.json(scanTicket(code, kamp), { headers: { 'Cache-Control': 'no-store' } })
}
