import { readDatavagt } from '../../../../lib/datavagt'
import { editorAllowed } from '../../../../lib/editorAccess'
import { readRettelser, setCoach } from '../../../../lib/rettelser'

export const dynamic = 'force-dynamic'

// The news scout's part of the datavagt (deploy/claude-editor/NYHEDER.md): it reads the night's findings and the
// coach list, and changes only the coach list – always as "claude", always with the sources in `why`.
// GET → { report, rettelser }; POST { action: 'setCoach', slug, name, acting?, why } or { action: 'removeCoach', slug }.

export async function GET(request: Request) {
  if (!editorAllowed(request)) return Response.json({ error: 'Ingen adgang' }, { status: 401 })
  return Response.json({ report: readDatavagt(), rettelser: readRettelser() })
}

export async function POST(request: Request) {
  if (!editorAllowed(request)) return Response.json({ error: 'Ingen adgang' }, { status: 401 })
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
  const slug = str(b.slug, 80)
  if (!/^[a-z0-9-]+$/.test(slug)) return Response.json({ error: 'slug mangler eller er ugyldig' }, { status: 400 })
  if (b.action === 'setCoach') {
    const name = str(b.name, 80)
    const why = str(b.why, 300)
    if (!name || !why) return Response.json({ error: 'name og why skal udfyldes' }, { status: 400 })
    setCoach(slug, { name, acting: b.acting === true, why }, 'claude')
    return Response.json({ ok: true, coach: readRettelser().coaches[slug] })
  }
  if (b.action === 'removeCoach') {
    setCoach(slug, null, 'claude')
    return Response.json({ ok: true })
  }
  return Response.json({ error: 'Ukendt handling' }, { status: 400 })
}
