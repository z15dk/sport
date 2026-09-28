import type { Metadata } from 'next'
import { isAdmin } from '../../../../../lib/admin'
import { validApproval } from '../../../../../lib/socialEngine'
import { KIND_NAMES, STATUS_NAMES, readPosts, type SocialPost } from '../../../../../lib/socialStore'
import { formatLong, formatTime } from '../../../../../lib/time'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Godkend opslag · Matchly', robots: { index: false, follow: false } }

// The page an approval mail links to: the posts with their pictures and text,
// each with Godkend / Spring over, and one button for them all. The link's
// signature is the access, so it works on the phone without logging in.

type Props = { params: Promise<{ batch: string }>; searchParams: Promise<{ t?: string; ok?: string }> }

const when = (ms: number) => `${formatLong(new Date(ms))} kl. ${formatTime(new Date(ms))}`

function state(p: SocialPost) {
  if (p.status !== 'waiting') return STATUS_NAMES[p.status]
  return p.approval === 'pending' ? 'Venter på godkendelse' : 'Godkendt – postes til tiden'
}

export default async function ApprovePage({ params, searchParams }: Props) {
  const { batch } = await params
  const { t, ok } = await searchParams
  const allowed = validApproval(batch, t) || (await isAdmin())
  if (!allowed)
    return (
      <div className="page">
        <div className="clubs prose">
          <h1 className="feed__title">Linket virker ikke</h1>
          <p>Linket er udløbet eller forkert. Godkend opslagene på /admin/sociale i stedet.</p>
        </div>
      </div>
    )
  const ids = readPosts().batches[batch]?.ids ?? []
  const posts = readPosts()
    .posts.filter((p) => ids.includes(p.id))
    .sort((a, b) => a.scheduledAt - b.scheduledAt)
  const open = posts.filter((p) => p.approval === 'pending' && p.status === 'waiting')
  const button = (action: 'approve' | 'skip', label: string, id?: string, primary?: boolean) => (
    <form method="post" action="/api/social/approve" className="social-inline">
      <input type="hidden" name="batch" value={batch} />
      <input type="hidden" name="t" value={t ?? ''} />
      <input type="hidden" name="action" value={action} />
      {id && <input type="hidden" name="id" value={id} />}
      <button type="submit" className={primary ? 'pill is-active' : 'pill'}>
        {label}
      </button>
    </form>
  )
  return (
    <div className="page">
      <div className="clubs prose admin">
        <h1 className="feed__title">Godkend opslag</h1>
        {ok && <p className="social-msg is-ok">{ok === 'approve' ? 'Godkendt.' : 'Sprunget over.'}</p>}
        {open.length > 1 && <p>{button('approve', `Godkend alle ${open.length}`, undefined, true)}</p>}
        {posts.map((p) => (
          <article key={p.id} className={`social-post is-${p.status}${p.approval === 'pending' && p.status === 'waiting' ? ' is-pending' : ''}`}>
            <header>
              <strong className="social-post__time">{formatTime(new Date(p.scheduledAt))}</strong>
              <div>
                <h3>{p.title}</h3>
                <p className="muted small">
                  {KIND_NAMES[p.kind]} · {when(p.scheduledAt)} · {state(p)}
                </p>
              </div>
            </header>
            <div className="social-thumbs">
              {p.images.map((i) => (
                <a key={i.file} href={`/sociale-billeder/${i.file}`} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element -- the card's own picture */}
                  <img src={`/sociale-billeder/${i.file}`} alt="" className={i.surface === 'story' ? 'is-story' : undefined} />
                </a>
              ))}
            </div>
            {p.caption && p.kind !== 'story' && <pre className="social-pre">{p.caption}</pre>}
            {p.approval === 'pending' && p.status === 'waiting' && (
              <footer>
                {button('approve', 'Godkend', p.id, true)}
                {button('skip', 'Spring over', p.id)}
              </footer>
            )}
          </article>
        ))}
        {!posts.length && <p className="muted">Ingen opslag i denne mail.</p>}
        <p className="muted small">Teksten kan rettes på /admin/sociale (kræver login).</p>
      </div>
    </div>
  )
}
