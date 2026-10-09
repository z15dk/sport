import { editorAllowed } from '../../../../lib/editorAccess'
import { indexNowByHand } from '../../../../lib/indexnow'
import { growthBrief, pageBaseline, writeDiary } from '../../../../lib/jamesGrowth'
import { judgeSeoOverride, setSeoOverride } from '../../../../lib/seoOverrides'

export const dynamic = 'force-dynamic'

// James' daily growth round (deploy/claude-editor/VAEKST.md, the editor's key): GET → the numbers and what he may
// act on (src/lib/jamesGrowth.ts). POST
//   { action: 'titel', path, title?, description?, query?, why }  a better title/description (sent to Index Now)
//   { action: 'behold' | 'fortryd', path, why }                    the verdict on a title test after 14 days
//   { action: 'dagbog', text, actions: [], ideas: [], numbers? }    today's diary entry, shown on /admin/vaekst (ideas: for the news scout)

export async function GET(request: Request) {
  if (!editorAllowed(request)) return Response.json({ error: 'Ingen adgang' }, { status: 401 })
  return Response.json(await growthBrief())
}

export async function POST(request: Request) {
  if (!editorAllowed(request)) return Response.json({ error: 'Ingen adgang' }, { status: 401 })
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const str = (v: unknown, max = 400) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
  const pagePath = str(b.path, 200)
  switch (b.action) {
    case 'titel': {
      const r = setSeoOverride({ path: pagePath, title: str(b.title, 80) || undefined, description: str(b.description, 200) || undefined, query: str(b.query, 120) || undefined, why: str(b.why) }, 'claude', await pageBaseline(pagePath))
      if (r.error) return Response.json(r, { status: 400 })
      await indexNowByHand([pagePath]).catch(() => undefined)
      return Response.json({ ok: true })
    }
    case 'behold':
    case 'fortryd': {
      const r = judgeSeoOverride(pagePath, b.action, str(b.why), 'claude')
      if (r.error) return Response.json(r, { status: 400 })
      if (b.action === 'fortryd') await indexNowByHand([pagePath]).catch(() => undefined)
      return Response.json({ ok: true })
    }
    case 'dagbog': {
      const actions = Array.isArray(b.actions) ? b.actions.map((x) => str(x, 300)) : []
      const n = b.numbers as Record<string, unknown> | undefined
      const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
      const ideas = Array.isArray(b.ideas) ? b.ideas.map((x) => str(x, 300)) : []
      const r = writeDiary(str(b.text, 1500), actions, n && { viewsYesterday: num(n.viewsYesterday) ?? 0, viewsDayBefore: num(n.viewsDayBefore) ?? 0, clicks7: num(n.clicks7), impressions7: num(n.impressions7), position7: num(n.position7) }, ideas)
      return r.error ? Response.json(r, { status: 400 }) : Response.json({ ok: true })
    }
    default:
      return Response.json({ error: 'Ukendt handling (titel, behold, fortryd, dagbog)' }, { status: 400 })
  }
}
