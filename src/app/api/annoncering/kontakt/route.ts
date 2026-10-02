import { saveLead } from '../../../../lib/ticketShop'
import { mailReady, sendMail } from '../../../../lib/mail'

// "Hør om priser" on /annoncering: the advertiser's company and contact, shown on /admin/reklamer
// (and mailed to the owner when the SMTP under the social settings is set up)
export async function POST(request: Request) {
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const s = (k: string) => (typeof b[k] === 'string' ? (b[k] as string) : '')
  // A field people don't see: filled in by robots only
  if (s('website')) return Response.json({ ok: true })
  const lead = { club: s('club'), name: s('name'), email: s('email'), phone: s('phone'), message: s('message') }
  const result = saveLead(lead, 'annoncering')
  if ('ok' in result && mailReady()) {
    const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)
    const lines = [`Virksomhed: ${lead.club}`, `Navn: ${lead.name}`, `Mail: ${lead.email}`, `Telefon: ${lead.phone}`, '', lead.message]
    sendMail(`Annoncering: ${lead.club.trim()} vil høre om priser`, `<p>${lines.map(esc).join('<br>')}</p><p>Alle henvendelser: /admin/reklamer</p>`, `${lines.join('\n')}\n\nAlle henvendelser: /admin/reklamer`).catch(() => undefined)
  }
  return Response.json(result, { status: 'error' in result ? 400 : 200 })
}
