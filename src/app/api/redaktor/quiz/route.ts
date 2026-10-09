import { editorAllowed } from '../../../../lib/editorAccess'
import { makeEpisode, seriesBrief } from '../../../../lib/quizReel'

export const dynamic = 'force-dynamic'
// Making a video takes some seconds
export const maxDuration = 300

// James' quiz round (deploy/claude-editor/QUIZ.md, the editor's key): GET → the series so far (the clubs used, the next
// episode's number and whose answer it opens with). POST { action: 'afsnit', club, level: 'nem'|'mellem'|'svær',
// clues: [svær, mellem, nem], caption, answerNote? } makes the next episode's video (src/lib/quizReel.tsx); it waits on
// /admin/quiz for the owner.

export async function GET(request: Request) {
  if (!editorAllowed(request)) return Response.json({ error: 'Ingen adgang' }, { status: 401 })
  return Response.json(await seriesBrief())
}

export async function POST(request: Request) {
  if (!editorAllowed(request)) return Response.json({ error: 'Ingen adgang' }, { status: 401 })
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
  if (b.action !== 'afsnit') return Response.json({ error: 'Ukendt handling' }, { status: 400 })
  try {
    const r = await makeEpisode({ club: b.club, level: b.level, clues: b.clues, caption: b.caption, answerNote: b.answerNote }, 'claude')
    if (r.error) return Response.json({ error: r.error }, { status: 400 })
    return Response.json({ ok: true, n: r.episode!.n, club: r.episode!.club })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
