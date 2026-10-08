import { saveLead } from '../../../../lib/ticketShop'
import { formLimited, readSmallJson } from '../../../../lib/formGuard'
import { mailReady, sendMail } from '../../../../lib/mail'

// "Hør om priser" on /annoncering: the advertiser's company and contact, shown on /admin/reklamer
// (and mailed to the owner when the SMTP under the social settings is set up)
export async function POST(request: Request) {
  const b = await readSmallJson(request)
  if (!b) return Response.json({ error: 'Henvendelsen er for lang – skriv lidt kortere' }, { status: 400 })
  const s = (k: string) => (typeof b[k] === 'string' ? (b[k] as string) : '')
  // A field people don't see: filled in by robots only
  if (s('website')) return Response.json({ ok: true })
  if (formLimited(request)) return Response.json({ error: 'Du har sendt flere henvendelser lige nu – prøv igen om lidt' }, { status: 429 })
  const result = saveLead({ club: s('club'), name: s('name'), email: s('email'), phone: s('phone'), message: s('message') }, 'annoncering')
  if ('ok' in result && mailReady()) {
    // The saved, cut-to-size fields – never the raw ones – go in the mail
    const lead = result.lead
    const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)
    const lines = [`Virksomhed: ${lead.club}`, `Navn: ${lead.name}`, `Mail: ${lead.email}`, `Telefon: ${lead.phone}`, '', lead.message]
    sendMail(`Annoncering: ${lead.club.trim()} vil høre om priser`, `<p>${lines.map(esc).join('<br>')}</p><p>Alle henvendelser: /admin/reklamer</p>`, `${lines.join('\n')}\n\nAlle henvendelser: /admin/reklamer`).catch(() => undefined)
  }
  return Response.json('error' in result ? result : { ok: true }, { status: 'error' in result ? 400 : 200 })
}
