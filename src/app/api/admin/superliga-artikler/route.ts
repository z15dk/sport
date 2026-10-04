import { adminDenied } from '../../../../lib/admin'
import { saveSuperligaDraft, SUPERLIGA_KINDS, type SuperligaKind } from '../../../../lib/superligaArticles'

/** The Superliga articles as drafts: JSON { kinds: ("tal" | "form" | "top6")[] }, none = all three */
export async function POST(request: Request) {
  const denied = await adminDenied(request)
  if (denied) return Response.json({ error: denied }, { status: 401 })
  const b = (await request.json().catch(() => ({}))) as { kinds?: unknown }
  const known = SUPERLIGA_KINDS.map((k) => k.kind)
  const kinds = (Array.isArray(b.kinds) ? b.kinds.map(String) : known).filter((k): k is SuperligaKind => known.includes(k as SuperligaKind))
  const results = kinds.map((kind) => ({ kind, ...saveSuperligaDraft(kind) }))
  const errors = results.filter((r) => r.error)
  return Response.json({ ok: !errors.length, made: results.filter((r) => r.id && !r.skipped).length, skipped: results.filter((r) => r.skipped).length, errors }, { status: errors.length && errors.length === results.length ? 400 : 200 })
}
