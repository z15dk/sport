import { editorAllowed } from '../../../../lib/editorAccess'
import { abroadTeam, readAbroad, setAbroadPlayers, setAbroadRoundup } from '../../../../lib/abroad'
import { abroadFace, abroadSquad, resolveAbroadIds, type AbroadFace } from '../../../../lib/abroadPhotos'

export const dynamic = 'force-dynamic'

// "Danskere i udlandet" (src/lib/abroad.ts, deploy/claude-editor/UDLANDET.md): GET → the list and the roundup as they
// stand; GET ?billeder=1 → the players without a photo, each with his club's squad at the source (id, name), so James
// can give him "apiId". POST { action: 'spillere', players: [{ name, club, position?, note? }] } replaces the whole list;
// { action: 'opsamling', html } the weekly roundup; { action: 'find-billeder' } looks up the missing players' ids now.

export async function GET(request: Request) {
  if (!editorAllowed(request)) return Response.json({ error: 'Ingen adgang' }, { status: 401 })
  if (new URL(request.url).searchParams.get('billeder')) {
    const missing = []
    for (const p of readAbroad().players) {
      const team = abroadTeam(p.club)
      if ((await abroadFace(p.name, team, p.apiId).catch((): AbroadFace => ({}))).photo) continue
      missing.push({ name: p.name, club: p.club, squad: await abroadSquad(team).catch(() => []) })
    }
    return Response.json({ missing })
  }
  return Response.json({ ...readAbroad(), page: '/danskere-i-udlandet' })
}

export async function POST(request: Request) {
  if (!editorAllowed(request)) return Response.json({ error: 'Ingen adgang' }, { status: 401 })
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
  if (b.action === 'spillere') {
    const r = setAbroadPlayers(b.players)
    if (r.error) return Response.json(r, { status: 400 })
    // The new players' photos are looked up in the background
    void resolveAbroadIds().catch(() => undefined)
    return Response.json({ ok: true, count: r.count })
  }
  // Looks up the players without a photo now (the squads, then the source's player search) and saves their ids
  if (b.action === 'find-billeder') return Response.json(await resolveAbroadIds())
  if (b.action === 'opsamling') {
    const r = setAbroadRoundup(b.html)
    return r.error ? Response.json(r, { status: 400 }) : Response.json({ ok: true })
  }
  return Response.json({ error: 'Brug spillere eller opsamling' }, { status: 400 })
}
