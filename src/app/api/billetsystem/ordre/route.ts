import { createDemoOrder } from '../../../../lib/ticketShop'
import { demoMatch } from '../../../../lib/ticketDemo'
import { findClub } from '../../../../data/matchInsights'

// The demo's purchase (/billetsystem/demo/<kamp>): JSON { kamp, quantities, name?, email? } -> { id }. No money is taken.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { kamp?: unknown; quantities?: Record<string, unknown>; name?: unknown; email?: unknown }
  const match = demoMatch(String(body.kamp ?? ''))
  if (!match) return Response.json({ error: 'Kampen findes ikke, eller den er gået i gang' }, { status: 400 })
  const quantities = Object.fromEntries(Object.entries(body.quantities ?? {}).map(([k, v]) => [k, Number(v)]))
  const result = createDemoOrder({
    match: { slug: match.slug, title: `${match.home.name} – ${match.away.name}`, kickoff: match.kickoff.getTime(), venue: match.venue, club: findClub(match.home.name)?.club.id ?? '' },
    quantities,
    name: typeof body.name === 'string' ? body.name : undefined,
    email: typeof body.email === 'string' ? body.email : undefined,
  })
  if ('error' in result) return Response.json(result, { status: 400 })
  return Response.json(result)
}
