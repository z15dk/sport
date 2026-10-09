import { editorAllowed } from '../../../../lib/editorAccess'
import { scoutDrafts } from '../../../../lib/datavagt'
import { markFastReport, pendingFastReports } from '../../../../lib/fastReports'

export const dynamic = 'force-dynamic'

// James' fast match reports (src/lib/fastReports.ts, the referat round in deploy/claude-editor/NYHEDER.md):
// GET → { matches } the finished Superliga and 1. division matches he should write a report on now.
// POST { action: 'skrevet', slug, id } marks one written (id: his report draft); { action: 'spring', slug, why } skips one.

export async function GET(request: Request) {
  if (!editorAllowed(request)) return Response.json({ error: 'Ingen adgang' }, { status: 401 })
  return Response.json({ matches: pendingFastReports() })
}

export async function POST(request: Request) {
  if (!editorAllowed(request)) return Response.json({ error: 'Ingen adgang' }, { status: 401 })
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const slug = typeof b.slug === 'string' ? b.slug.trim() : ''
  if (!/^[a-z0-9-]+$/.test(slug)) return Response.json({ error: 'slug mangler' }, { status: 400 })
  if (b.action === 'skrevet') {
    const id = Number(b.id)
    if (!scoutDrafts().some((a) => a.id === id)) return Response.json({ error: 'id skal være din egen kladde' }, { status: 400 })
    const r = markFastReport(slug, id)
    return r.error ? Response.json(r, { status: 400 }) : Response.json({ ok: true })
  }
  if (b.action === 'spring') {
    if (typeof b.why !== 'string' || !b.why.trim()) return Response.json({ error: 'why skal udfyldes' }, { status: 400 })
    const r = markFastReport(slug, 0)
    return r.error ? Response.json(r, { status: 400 }) : Response.json({ ok: true })
  }
  return Response.json({ error: 'Brug skrevet eller spring' }, { status: 400 })
}
