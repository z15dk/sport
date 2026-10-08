import { saveLead } from '../../../../lib/ticketShop'
import { formLimited, readSmallJson } from '../../../../lib/formGuard'

// "Hør mere" on /billetsystem: a club's name and contact, shown on /admin/billetter
export async function POST(request: Request) {
  const b = await readSmallJson(request)
  if (!b) return Response.json({ error: 'Henvendelsen er for lang – skriv lidt kortere' }, { status: 400 })
  const s = (k: string) => (typeof b[k] === 'string' ? (b[k] as string) : '')
  // A field people don't see: filled in by robots only
  if (s('website')) return Response.json({ ok: true })
  if (formLimited(request)) return Response.json({ error: 'Du har sendt flere henvendelser lige nu – prøv igen om lidt' }, { status: 429 })
  const result = saveLead({ club: s('club'), name: s('name'), email: s('email'), phone: s('phone'), message: s('message') })
  return Response.json('error' in result ? result : { ok: true }, { status: 'error' in result ? 400 : 200 })
}
