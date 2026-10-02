import { isAdmin, sameOrigin } from '../../../../lib/admin'
import { savePreviewDraft, upcomingFixtures } from '../../../../lib/previews/data'

/** Match previews as drafts: JSON { keys: string[] } for some matches, or { days } for every match in the next days */
export async function POST(request: Request) {
  if (!(await isAdmin()) || !sameOrigin(request)) return Response.json({ error: 'Ikke logget ind' }, { status: 401 })
  const b = (await request.json().catch(() => ({}))) as { keys?: unknown; days?: unknown }
  const keys = Array.isArray(b.keys) ? b.keys.map(String) : upcomingFixtures(Math.min(Math.max(Number(b.days ?? 7) || 7, 1), 30)).map((f) => f.key)
  const results = keys.slice(0, 50).map((k) => ({ key: k, ...savePreviewDraft(k) }))
  const errors = results.filter((r) => r.error)
  return Response.json({ ok: !errors.length, made: results.filter((r) => r.id && !r.skipped).length, skipped: results.filter((r) => r.skipped).length, errors }, { status: errors.length && errors.length === results.length ? 400 : 200 })
}
