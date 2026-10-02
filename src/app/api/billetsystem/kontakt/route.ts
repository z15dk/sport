import { saveLead } from '../../../../lib/ticketShop'

// "Hør mere" on /billetsystem: a club's name and contact, shown on /admin/billetter
export async function POST(request: Request) {
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const s = (k: string) => (typeof b[k] === 'string' ? (b[k] as string) : '')
  // A field people don't see: filled in by robots only
  if (s('website')) return Response.json({ ok: true })
  const result = saveLead({ club: s('club'), name: s('name'), email: s('email'), phone: s('phone'), message: s('message') })
  return Response.json(result, { status: 'error' in result ? 400 : 200 })
}
