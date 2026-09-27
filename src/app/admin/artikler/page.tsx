import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { isAdmin } from '../../../lib/admin'
import { allArticles, categories } from '../../../lib/articles'
import { AdminNav } from '../../../components/admin/AdminNav'
import { formatNumeric, formatTime } from '../../../lib/time'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Artikler · Admin', robots: { index: false, follow: false } }

/** Every article, like WordPress' "Alle indlæg" */
export default async function AdminArticles() {
  if (!(await isAdmin())) redirect('/admin')
  const list = allArticles()
  const cats = new Map(categories().map((c) => [c.slug, c.name]))
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
