import { editorAllowed } from '../../../../lib/editorAccess'
import { setTvText, tvTextsDue } from '../../../../lib/tvText'

export const dynamic = 'force-dynamic'

// James' text on the TV guide (src/lib/tvText.ts, deploy/claude-editor/OPTAKT.md): GET → { days } today and tomorrow,
// whether written, with the day's football on TV. POST { action: 'tekst', date, html } saves (or replaces) a day's text.

export async function GET(request: Request) {
  if (!editorAllowed(request)) return Response.json({ error: 'Ingen adgang' }, { status: 401 })
  return Response.json({ days: tvTextsDue() })
}

export async function POST(request: Request) {
  if (!editorAllowed(request)) return Response.json({ error: 'Ingen adgang' }, { status: 401 })
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
  if (b.action !== 'tekst') return Response.json({ error: 'Brug "tekst"' }, { status: 400 })
  const date = typeof b.date === 'string' ? b.date : ''
  const html = typeof b.html === 'string' ? b.html : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !html.trim()) return Response.json({ error: 'date (YYYY-MM-DD) og html skal med' }, { status: 400 })
  const r = setTvText(date, html)
  return r.error ? Response.json(r, { status: 400 }) : Response.json({ ok: true, page: date === tvTextsDue()[0].date ? '/tv' : '/tv/i-morgen' })
}
