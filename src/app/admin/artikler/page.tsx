import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { isAdmin } from '../../../lib/admin'
import { allArticles, categories } from '../../../lib/articles'
import { articleStats } from '../../../lib/articleStats'
import { AdminNav } from '../../../components/admin/AdminNav'
import { formatNumeric, formatTime } from '../../../lib/time'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Artikler · Admin', robots: { index: false, follow: false } }

/** Every article, like WordPress' "Alle indlæg" */
export default async function AdminArticles() {
  if (!(await isAdmin())) redirect('/admin')
  const list = allArticles()
  const cats = new Map(categories().map((c) => [c.slug, c.name]))
  const stats = articleStats(list)
  const n = (x: number) => x.toLocaleString('da-DK')
  const now = Date.now()
  const state = (a: (typeof list)[number]) =>
    a.status === 'draft' ? 'Kladde' : a.publishedAt && Date.parse(a.publishedAt) > now ? 'Planlagt' : 'Udgivet'
  return (
    <div className="page">
      <div className="clubs admin">
        <AdminNav current="/admin/artikler" />
        <div className="admin__head">
          <h1 className="feed__title">Artikler</h1>
          <Link className="pill is-active" href="/admin/artikler/ny">
            + Tilføj ny
          </Link>
        </div>
        <section className="panel">
          {list.length === 0 ? (
            <p className="muted pad">Ingen artikler endnu. Tryk &quot;Tilføj ny&quot; for at skrive den første.</p>
          ) : (
            <ul className="admin-list">
              {list.map((a) => (
                <li key={a.id} className="admin-list__row admin-article">
                  {a.featuredImage ? <img src={a.featuredImage} alt="" width={44} height={30} /> : <span className="admin-article__noimg" />}
                  <span className="admin-list__name">
                    <Link href={`/admin/artikler/${a.id}`}>
                      <strong>{a.title}</strong>
                    </Link>
                    <em>
                      {[cats.get(a.category ?? ''), a.tags.slice(0, 4).join(', ')].filter(Boolean).join(' · ') || 'Ingen kategori'}
                    </em>
                  </span>
                  {(() => {
                    const st = stats.get(a.id)!
                    const inTitle = [`${st.linksFromArticles} ${st.linksFromArticles === 1 ? 'anden artikel linker' : 'andre artikler linker'} hertil`, st.refVisits ? `${st.refVisits} besøg via links fra andre sider (${st.refDomains.join(', ')})` : 'ingen besøg via links fra andre sider de sidste 35 dage'].join(' · ')
                    return (
                      <span className="admin-article__stats">
                        <span title="Ord i teksten">
                          <b>{n(st.words)}</b> ord
                        </span>
                        <span title={`${n(st.views)} ${st.views === 1 ? 'visning' : 'visninger'} af ${n(st.visitors)} besøgende de sidste 35 dage`}>
                          <b>{n(st.views)}</b> visn.
                        </span>
                        <span title={inTitle}>
                          <b>{n(st.linksFromArticles + st.refDomains.length)}</b> ind
                        </span>
                        <span title={`${st.linksOut} ${st.linksOut === 1 ? 'link' : 'links'} i teksten, ${st.linksExternal} til andre sider`}>
                          <b>{n(st.linksOut)}</b> ud{st.linksExternal ? <em> ({st.linksExternal} ekst.)</em> : null}
                        </span>
                      </span>
                    )
                  })()}
                  <span className={`admin-article__state is-${state(a) === 'Udgivet' ? 'live' : state(a) === 'Planlagt' ? 'planned' : 'draft'}`}>{state(a)}</span>
                  <span className="muted small">
                    {formatNumeric(new Date(a.publishedAt ?? a.updatedAt))} {formatTime(new Date(a.publishedAt ?? a.updatedAt))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
