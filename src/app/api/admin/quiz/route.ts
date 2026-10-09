import { adminDenied } from '../../../../lib/admin'
import { makeEpisode, removeNewest, setPosted } from '../../../../lib/quizReel'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// The quiz series on /admin/quiz: POST { action: 'posted', n, posted } marks an episode as posted, { action: 'remove', n }
// removes the newest (not posted) one, { action: 'afsnit', club, level, clues, caption, answerNote? } makes one by hand.

export async function POST(request: Request) {
  const denied = await adminDenied(request)
  if (denied) return Response.json({ error: denied }, { status: 401 })
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const n = Number(b.n)
  try {
    const r =
      b.action === 'posted'
        ? setPosted(n, b.posted !== false)
        : b.action === 'remove'
          ? removeNewest(n)
          : b.action === 'afsnit'
            ? await makeEpisode({ club: b.club, level: b.level, clues: b.clues, caption: b.caption, answerNote: b.answerNote }, 'admin')
            : { error: 'Ukendt handling' }
    if (r.error) return Response.json({ error: r.error }, { status: 400 })
    return Response.json({ ok: true })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
