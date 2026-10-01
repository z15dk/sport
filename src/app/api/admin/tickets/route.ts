import { isAdmin, sameOrigin } from '../../../../lib/admin'
import { cleanTicketUrl, saveTicketConfig, ticketConfig, type TicketConfig } from '../../../../lib/tickets'

// /admin/billetter: one ticket link changed – JSON { kind: 'club' | 'league' | 'match' | 'partner', key, value }.
// value: the link (or the partner code); '' = none (no button); null = back to what it was (for a club: the link we found)
export async function POST(request: Request) {
  if (!(await isAdmin()) || !sameOrigin(request)) return Response.json({ error: 'Ikke logget ind' }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as { kind?: unknown; key?: unknown; value?: unknown }
  const kinds = { club: 'clubs', league: 'leagues', match: 'matches', partner: 'partners' } as const
  const kind = kinds[String(body.kind) as keyof typeof kinds]
  const key = String(body.key ?? '').trim().toLowerCase().slice(0, 200)
  if (!kind || !key) return Response.json({ error: 'Mangler felt' }, { status: 400 })
  const cfg = ticketConfig()
  const next: TicketConfig = { ...cfg, [kind]: { ...cfg[kind] } }
  const list = next[kind]
  if (body.value === null) delete list[key]
  else if (kind === 'partners') {
    const code = String(body.value ?? '').trim().replace(/^[?&]/, '')
    if (code && !/^[\w.-]+=[^\s&=]*(&[\w.-]+=[^\s&=]*)*$/.test(code)) return Response.json({ error: 'Partnerkoden skal se ud som ref=matchly' }, { status: 400 })
    const domain = key.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return Response.json({ error: 'Skriv et domæne, fx eventii.dk' }, { status: 400 })
    delete list[key]
    if (code) list[domain] = code
  } else {
    const url = cleanTicketUrl(body.value)
    if (url === undefined) return Response.json({ error: 'Linket ser forkert ud – skriv hele adressen, fx https://billet.klub.dk' }, { status: 400 })
    list[key] = url
  }
  saveTicketConfig(next)
  return Response.json({ ok: true })
}
