import type { Metadata } from 'next'
import { isAdmin } from '../../../../../lib/admin'
import { articleApprovalToken, nextMorning, parseIds, validArticlesApproval } from '../../../../../lib/articleApproval'
import { articleById, type Article } from '../../../../../lib/articles'
import { formatLong, formatTime } from '../../../../../lib/time'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Udgiv artikler · Matchly', robots: { index: false, follow: false } }

// Several drafts from one approval mail (e.g. the weekend's previews): each with its picture and a link to read
// it, and one button that publishes them all now or at 07.00. Signed by the mail's link, so no login is needed.

type Props = { searchParams: Promise<{ ids?: string; t?: string; ok?: string; fejl?: string }> }

export default async function ApproveArticlesPage({ searchParams }: Props) {
  const { ids: list, t, ok, fejl } = await searchParams
  const ids = parseIds(list)
  if (!(validArticlesApproval(ids, t) || (await isAdmin())))
    return (
      <div className="page">
        <div className="clubs prose">
          <h1 className="feed__title">Linket virker ikke</h1>
          <p>Linket er forkert. Find artiklerne under Artikler i admin.</p>
        </div>
      </div>
    )
  const articles = ids.map((id) => articleById(id)).filter((a): a is Article => !!a)
  const drafts = articles.filter((a) => a.status === 'draft')
  const morning = nextMorning()
  const button = (value: 'now' | 'morning', label: string, primary?: boolean) => (
    <form method="post" action="/api/articles/approve" className="social-inline">
      <input type="hidden" name="ids" value={ids.join(',')} />
      <input type="hidden" name="t" value={t ?? ''} />
      <input type="hidden" name="when" value={value} />
      <button type="submit" className={primary ? 'pill is-active' : 'pill'}>
        {label}
      </button>
    </form>
  )
  const state = (a: Article) =>
    a.status === 'draft' ? 'Kladde' : a.publishedAt && Date.parse(a.publishedAt) > Date.now() ? `Planlagt ${formatLong(new Date(a.publishedAt))} kl. ${formatTime(new Date(a.publishedAt))}` : 'Udgivet'
  return (
    <div className="page">
      <div className="clubs prose admin art-approve">
        {ok && <p className="social-msg is-ok">{ok === 'morning' ? `Planlagt til ${formatLong(morning)} kl. 07.00. De deles på Facebook, når de går live.` : 'Udgivet. De deles på Facebook om lidt.'}</p>}
        {fejl && <p className="social-msg is-error">{fejl} kunne ikke udgives – se dem i admin.</p>}
        <h1 className="feed__title">{drafts.length ? `${drafts.length} artikler klar` : 'Artiklerne'}</h1>
        {drafts.length > 0 && (
          <div className="art-approve__actions">
            {button('morning', `Udgiv alle ${formatLong(morning)} kl. 07.00`, true)}
            {button('now', 'Udgiv alle nu')}
          </div>
        )}
        <ul className="art-approve__list">
          {articles.map((a) => (
            <li key={a.id}>
              {/* eslint-disable-next-line @next/next/no-img-element -- the article's own upload */}
              {a.featuredImage && <img src={a.featuredImage} alt="" />}
              <div>
                <a href={`/admin/artikler/godkend/${a.id}?t=${articleApprovalToken(a.id)}`}>
                  <strong>{a.title}</strong>
                </a>
                <span className="muted small">{state(a)}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
