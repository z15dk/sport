import { editorAllowed } from '../../../../lib/editorAccess'
import { readAbroad, setAbroadPlayers, setAbroadRoundup } from '../../../../lib/abroad'

export const dynamic = 'force-dynamic'

// "Danskere i udlandet" (src/lib/abroad.ts, deploy/claude-editor/UDLANDET.md): GET → the list and the roundup as they
// stand. POST { action: 'spillere', players: [{ name, club, position?, note? }] } replaces the whole list;
// { action: 'opsamling', html } the weekly roundup.

export async function GET(request: Request) {
  if (!editorAllowed(request)) return Response.json({ error: 'Ingen adgang' }, { status: 401 })
  return Response.json({ ...readAbroad(), page: '/danskere-i-udlandet' })
}

export async function POST(request: Request) {
  if (!editorAllowed(request)) return Response.json({ error: 'Ingen adgang' }, { status: 401 })
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
  if (b.action === 'spillere') {
    const r = setAbroadPlayers(b.players)
    return r.error ? Response.json(r, { status: 400 }) : Response.json({ ok: true, count: r.count })
  }
  if (b.action === 'opsamling') {
    const r = setAbroadRoundup(b.html)
    return r.error ? Response.json(r, { status: 400 }) : Response.json({ ok: true })
  }
  return Response.json({ error: 'Brug spillere eller opsamling' }, { status: 400 })
}
