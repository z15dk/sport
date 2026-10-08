import type { Metadata } from 'next'
import { isAdmin } from '../../../../../lib/admin'
import { nextMorning, validArticleApproval } from '../../../../../lib/articleApproval'
import { articleById, cleanHtml } from '../../../../../lib/articles'
import { qualityOf } from '../../../../../lib/articleQuality'
import { ClaudeNote } from '../../../../../components/admin/ClaudeNote'
import { paths } from '../../../../../lib/site'
import { seoChecks } from '../../../../../lib/seoChecks'
import { formatLong, formatTime } from '../../../../../lib/time'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Udgiv artikel · Matchly', robots: { index: false, follow: false } }

// The page an article approval mail links to: the draft as the reader will see it, with
// "Udgiv nu" and "Udgiv kl. 07.00". The link's signature is the access, so it works on the
// phone without logging in.

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string; ok?: string; fejl?: string; claude?: string }> }

const when = (d: Date) => `${formatLong(d)} kl. ${formatTime(d)}`

export default async function ApproveArticlePage({ params, searchParams }: Props) {
  const id = Number((await params).id)
  const { t, ok, fejl, claude } = await searchParams
  const a = Number.isInteger(id) ? articleById(id) : undefined
  if (!a || !(validArticleApproval(id, t) || (await isAdmin())))
    return (
      <div className="page">
        <div className="clubs prose">
          <h1 className="feed__title">Linket virker ikke</h1>
          <p>Linket er forkert, eller artiklen findes ikke længere. Find den under Artikler i admin.</p>
        </div>
      </div>
    )
  const live = a.status === 'published' && a.publishedAt
  const planned = live && Date.parse(a.publishedAt!) > Date.now()
  const morning = nextMorning()
  const issues = seoChecks(a).filter((c) => c.level === 'bad')
  // An automatic preview or report: the Claude writer's verdict and "Besked til Claude"
  const mark = qualityOf(a.id)
  const button = (value: 'now' | 'morning', label: string, primary?: boolean) => (
    <form method="post" action="/api/articles/approve" className="social-inline">
      <input type="hidden" name="id" value={a.id} />
      <input type="hidden" name="t" value={t ?? ''} />
      <input type="hidden" name="when" value={value} />
      <button type="submit" className={primary ? 'pill is-active' : 'pill'}>
        {label}
      </button>
    </form>
  )
  return (
    <div className="page">
      <div className="clubs prose admin art-approve">
        {ok && (
          <p className="social-msg is-ok">
            {ok === 'morning' ? `Planlagt til ${when(morning)}.${a.noSocial ? '' : ' Den deles på Facebook, når den går live.'}` : `Udgivet.${a.noSocial ? '' : ' Den deles på Facebook om lidt.'}`}
          </p>
        )}
        {fejl && <p className="social-msg is-error">{fejl}</p>}
        <p className="muted small">
          {live ? (planned ? `Planlagt til ${when(new Date(a.publishedAt!))}` : `Udgivet ${when(new Date(a.publishedAt!))}`) : 'Kladde – ikke udgivet'}
          {a.category && ` · ${a.category}`}
        </p>
        <h1 className="feed__title">{a.title}</h1>
        {a.excerpt && <p className="art-approve__lead">{a.excerpt}</p>}
        {/* eslint-disable-next-line @next/next/no-img-element -- the article's own upload */}
        {a.featuredImage ? <img className="art-approve__img" src={a.featuredImage} alt={a.featuredAlt ?? ''} /> : <p className="social-msg is-error">Ingen udvalgt billede – vælg et på computeren, før den udgives.</p>}
        {!live && (
          <div className="art-approve__actions">
            {button('now', 'Udgiv nu', true)}
            {button('morning', `Udgiv ${formatLong(morning)} kl. 07.00`)}
            <a className="text-btn" href={`/admin/artikler/${a.id}`}>
              Ret på computeren
            </a>
          </div>
        )}
        {live && (
          <p>
            <a className="pill" href={paths.article(a.slug)}>
              Se artiklen
            </a>
          </p>
        )}
        {issues.length > 0 && !live && (
          <ul className="art-approve__issues">
            {issues.map((c) => (
              <li key={c.id}>🔴 {c.text}</li>
            ))}
          </ul>
        )}
        {mark && !live && <ClaudeNote id={a.id} mark={mark} t={t} sent={claude === '1'} />}
        {/* Cleaned again when shown, as on the public article page */}
        <div className="art-approve__body" dangerouslySetInnerHTML={{ __html: cleanHtml(a.content) }} />
        {!live && <div className="art-approve__actions">{button('now', 'Udgiv nu', true)}</div>}
      </div>
    </div>
  )
}
