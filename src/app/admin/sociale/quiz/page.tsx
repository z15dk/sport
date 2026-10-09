import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AdminNav } from '../../../../components/admin/AdminNav'
import { QuizEpisodeActions } from '../../../../components/admin/QuizEpisodeActions'
import { isAdmin } from '../../../../lib/admin'
import { hasSound, hasVideo, readSeries } from '../../../../lib/quizReel'
import { QuizSound } from '../../../../components/admin/QuizSound'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Gæt klubben', robots: { index: false, follow: false } }

// The "Gæt klubben" quiz series for Reels (src/lib/quizReel.tsx): James makes three episodes a week; here the owner
// sees each video with its post text, downloads it, posts it as a Reel and marks it as posted.

const LEVEL: Record<string, string> = { nem: 'Nem', mellem: 'Mellem', svær: 'Svær' }
const when = (t: number) => new Date(t).toLocaleString('da-DK', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Copenhagen' })

export default async function QuizPage() {
  if (!(await isAdmin())) redirect('/admin')
  const list = readSeries().slice().reverse()
  return (
    <div className="page">
      <div className="clubs admin">
        <AdminNav current="/admin/sociale/quiz" />
        <h1 className="feed__title">Gæt klubben</h1>
        <p className="muted small">
          En quiz-serie til Reels. Hvert afsnit starter med svaret fra det forrige og slutter uden svar. James holder sig to uger foran: der ligger altid seks afsnit klar til mandag, onsdag og fredag. Download videoen, læg den op som Reel med en trending lyd, og marker den som lagt op.
        </p>
        <QuizSound has={hasSound()} />
        {list.length === 0 && <p className="panel pad muted">Ingen afsnit endnu.</p>}
        {list.map((e, i) => (
          <section key={e.n} className="panel pad" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 220px) minmax(0, 1fr)', gap: 20, alignItems: 'start' }}>
            {hasVideo(e.n) ? (
              <video src={`/api/admin/quiz/video/${e.n}`} controls preload="metadata" style={{ width: '100%', borderRadius: 14, background: '#0f110c', aspectRatio: '9 / 16' }} />
            ) : (
              <p className="muted small">Videoen mangler</p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <h2 className="panel__title">
                Afsnit {e.n}: {e.club}
              </h2>
              <p className="muted small">
                {e.plannedFor && <b>Planlagt {new Date(`${e.plannedFor}T12:00:00Z`).toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'long' })} · </b>}
                {LEVEL[e.level]} · lavet {when(e.createdAt)} af {e.by === 'claude' ? 'James' : 'dig'}
                {e.postedAt ? ` · lagt op ${when(e.postedAt)}` : ' · ikke lagt op endnu'}
              </p>
              <ol style={{ margin: 0, paddingLeft: 20 }}>
                {e.clues.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ol>
              <label className="small">
                <span className="muted">Opslagets tekst</span>
                <textarea readOnly defaultValue={e.caption} rows={4} style={{ width: '100%' }} />
              </label>
              <QuizEpisodeActions n={e.n} posted={!!e.postedAt} newest={i === 0} hasVideo={hasVideo(e.n)} />
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
