import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { isAdmin } from '../../../lib/admin'
import { allArticles, categories } from '../../../lib/articles'
import { articleStats } from '../../../lib/articleStats'
import { AdminNav } from '../../../components/admin/AdminNav'
import { formatNumeric, formatTime } from '../../../lib/time'
import { paths } from '../../../lib/site'
import type { ArticleStat } from '../../../lib/articleStats'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Artikler · Admin', robots: { index: false, follow: false } }

/** Every article, like WordPress' "Alle indlæg" */
export default async function AdminArticles() {
  if (!(await isAdmin())) redirect('/admin')
  const list = allArticles()
  const cats = new Map(categories().map((c) => [c.slug, c.name]))
  const stats = articleStats(list)
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
                  <ArticleFacts st={stats.get(a.id)!} path={paths.article(a.slug)} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

const n = (x: number) => x.toLocaleString('da-DK')
const few = (items: string[], max = 3) => (items.length <= max ? items.join(', ') : `${items.slice(0, max).join(', ')} og ${items.length - max} til`)

/** The facts under an article: the text, the page's views, links in and links out – every number with its words */
function ArticleFacts({ st, path }: { st: ArticleStat; path: string }) {
  const refVisits = st.refSites.reduce((s, r) => s + r.visits, 0)
  return (
    <dl className="admin-article__facts">
      <div>
        <dt>Tekst</dt>
        <dd>
          <b>{n(st.words)} ord</b> · {st.readingMinutes} min. læsetid
        </dd>
        <dd>
          {st.headings} {st.headings === 1 ? 'mellemrubrik' : 'mellemrubrikker'} · {st.images} {st.images === 1 ? 'billede' : 'billeder'}
        </dd>
        <dd>
          {st.focusKeyword ? (
            <>
              Fokus-søgeord &quot;{st.focusKeyword}&quot;: {st.focusInTitle ? 'i titlen' : 'ikke i titlen'}, {st.focusInText ? 'i teksten' : 'ikke i teksten'}
            </>
          ) : (
            'Intet fokus-søgeord'
          )}
          {' · '}
          {st.metaLength ? `metabeskrivelse ${st.metaLength} tegn` : 'ingen metabeskrivelse'}
        </dd>
      </div>
      <div>
        <dt>Visninger</dt>
        <dd>
          <b>{n(st.views)} {st.views === 1 ? 'visning' : 'visninger'}</b> de sidste 35 dage
        </dd>
        <dd>
          {n(st.visitors)} {st.visitors === 1 ? 'besøgende' : 'besøgende'} · i dag {n(st.viewsToday)} · sidste 7 dage {n(st.viewsWeek)}
        </dd>
        <dd>
          <a href={path} target="_blank" rel="noopener">
            {path}
          </a>
        </dd>
      </div>
      <div>
        <dt>Links ind</dt>
        <dd>
          <b>
            {st.linkingArticles.length} {st.linkingArticles.length === 1 ? 'egen artikel' : 'egne artikler'} linker hertil
          </b>
          {st.linkingArticles.length > 0 && `: ${few(st.linkingArticles.map((l) => l.title), 2)}`}
        </dd>
        <dd>
          {st.refSites.length ? (
            <>
              <b>
                {st.refSites.length} {st.refSites.length === 1 ? 'anden side' : 'andre sider'} har sendt {n(refVisits)} besøg
              </b>
              : {few(st.refSites.map((r) => `${r.site} (${r.visits})`))}
            </>
          ) : (
            'Ingen besøg via links fra andre sider de sidste 35 dage'
          )}
        </dd>
        <dd className="muted">Søgemaskiner og sociale medier tælles ikke som links</dd>
      </div>
      <div>
        <dt>Links ud</dt>
        <dd>
          <b>
            {st.linksOut} {st.linksOut === 1 ? 'link' : 'links'} i teksten
          </b>
        </dd>
        <dd>
          {st.linksInternal} til egne sider · {st.linksExternal} til andre sider
        </dd>
        <dd>{st.externalSites.length ? few(st.externalSites) : 'Ingen eksterne links'}</dd>
      </div>
    </dl>
  )
}
