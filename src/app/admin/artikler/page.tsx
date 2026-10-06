import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { isAdmin } from '../../../lib/admin'
import { allArticles, categories } from '../../../lib/articles'
import { articleStats } from '../../../lib/articleStats'
import { AdminNav } from '../../../components/admin/AdminNav'
import { ActionButton } from '../../../components/admin/SocialAdmin'
import { formatNumeric, formatTime } from '../../../lib/time'
import { paths } from '../../../lib/site'
import type { ArticleStat } from '../../../lib/articleStats'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Artikler · Admin', robots: { index: false, follow: false } }

type Status = 'kladde' | 'planlagt' | 'udgivet'
const STATUS: { key: Status | ''; label: string }[] = [
  { key: '', label: 'Alle' },
  { key: 'kladde', label: 'Kladder' },
  { key: 'planlagt', label: 'Planlagt' },
  { key: 'udgivet', label: 'Udgivet' },
]

/** The SEO checks shown as small marks on each row: what is done (✓) and what is missing */
function seoChecks(a: { featuredImage?: string }, st: ArticleStat) {
  return [
    { ok: !!st.focusKeyword && st.focusInTitle, label: 'Søgeord i titel' },
    { ok: !!st.focusKeyword && st.focusInText, label: 'Søgeord i tekst' },
    { ok: st.metaLength >= 120 && st.metaLength <= 160, label: `Meta ${st.metaLength || 0} tegn` },
    { ok: st.linksInternal >= 5, label: `${st.linksInternal} interne links` },
    { ok: !!a.featuredImage, label: 'Billede' },
  ]
}

/**
 * Every article, like WordPress' "Alle indlæg", made for an overview: tabs by status with counts, a search, the numbers
 * for the week on top, and one compact row per article (picture, title, state and date, views, words, SEO marks,
 * actions) with the full facts behind "Detaljer". Drafts and scheduled articles come first – they need doing.
 */
export default async function AdminArticles({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; kategori?: string }> }) {
  if (!(await isAdmin())) redirect('/admin')
  const params = await searchParams
  const all = allArticles()
  const cats = new Map(categories().map((c) => [c.slug, c.name]))
  const stats = articleStats(all)
  const now = Date.now()
  const state = (a: (typeof all)[number]): Status =>
    a.status === 'draft' ? 'kladde' : a.publishedAt && Date.parse(a.publishedAt) > now ? 'planlagt' : 'udgivet'
  const counts = { '': all.length, kladde: 0, planlagt: 0, udgivet: 0 } as Record<Status | '', number>
  for (const a of all) counts[state(a)]++
  const status = (['kladde', 'planlagt', 'udgivet'] as const).find((x) => x === params.status) ?? ''
  const q = (params.q ?? '').trim().toLowerCase()
  const cat = params.kategori ?? ''
  const order: Record<Status, number> = { kladde: 0, planlagt: 1, udgivet: 2 }
  const list = all
    .filter((a) => (!status || state(a) === status) && (!cat || a.category === cat) && (!q || `${a.title} ${a.tags.join(' ')} ${a.slug}`.toLowerCase().includes(q)))
    .sort((a, b) => order[state(a)] - order[state(b)] || (b.publishedAt ?? b.updatedAt).localeCompare(a.publishedAt ?? a.updatedAt))
  const week = all.reduce((s, a) => s + (stats.get(a.id)?.viewsWeek ?? 0), 0)
  const publishedWeek = all.filter((a) => state(a) === 'udgivet' && a.publishedAt && now - Date.parse(a.publishedAt) < 7 * 86_400_000).length
  const href = (p: { status?: string; q?: string; kategori?: string }) => {
    const u = new URLSearchParams()
    const v = { status, q: params.q ?? '', kategori: cat, ...p }
    for (const [k, x] of Object.entries(v)) if (x) u.set(k, x)
    return `/admin/artikler${u.toString() ? `?${u}` : ''}`
  }
  const label = { kladde: 'Kladde', planlagt: 'Planlagt', udgivet: 'Udgivet' }
  const cls = { kladde: 'draft', planlagt: 'planned', udgivet: 'live' }

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

        <div className="dash-tiles arts-tiles">
          <Link className={`dash-tile${counts.kladde ? ' is-warn' : ''}`} href={href({ status: 'kladde' })}>
            <span className="dash-tile__label">Kladder</span>
            <strong className="dash-tile__value">{counts.kladde}</strong>
            <span className="dash-tile__sub">{counts.kladde ? 'venter på at blive læst og udgivet' : 'ingen ventende'}</span>
          </Link>
          <Link className="dash-tile" href={href({ status: 'planlagt' })}>
            <span className="dash-tile__label">Planlagt</span>
            <strong className="dash-tile__value">{counts.planlagt}</strong>
            <span className="dash-tile__sub">udgives af sig selv</span>
          </Link>
          <div className="dash-tile">
            <span className="dash-tile__label">Udgivet de sidste 7 dage</span>
            <strong className="dash-tile__value">{publishedWeek}</strong>
            <span className="dash-tile__sub">{counts.udgivet} udgivet i alt</span>
          </div>
          <div className="dash-tile">
            <span className="dash-tile__label">Visninger, 7 dage</span>
            <strong className="dash-tile__value">{n(week)}</strong>
            <span className="dash-tile__sub">alle artikler tilsammen</span>
          </div>
        </div>

        <div className="arts-bar">
          <nav className="filter-bar" aria-label="Status">
            {STATUS.map((s) => (
              <Link key={s.key} className={`pill${status === s.key ? ' is-active' : ''}`} href={href({ status: s.key })}>
                {s.label} <span className="pill__count">{counts[s.key]}</span>
              </Link>
            ))}
          </nav>
          <form className="arts-search" method="get">
            {status && <input type="hidden" name="status" value={status} />}
            <select name="kategori" defaultValue={cat} aria-label="Kategori">
              <option value="">Alle kategorier</option>
              {[...cats].map(([slug, name]) => (
                <option key={slug} value={slug}>
                  {name}
                </option>
              ))}
            </select>
            <input type="search" name="q" defaultValue={params.q ?? ''} placeholder="Søg i titler og tags …" />
            <button type="submit" className="pill">
              Søg
            </button>
          </form>
        </div>

        {list.length === 0 ? (
          <p className="panel muted pad">{all.length ? 'Ingen artikler passer til filteret.' : 'Ingen artikler endnu. Tryk "Tilføj ny" for at skrive den første.'}</p>
        ) : (
          <ul className="arts-list">
            {list.map((a) => {
              const st = state(a)
              const f = stats.get(a.id)!
              const checks = seoChecks(a, f)
              const missing = checks.filter((c) => !c.ok)
              const when = new Date(a.publishedAt ?? a.updatedAt)
              return (
                <li key={a.id} className={`arts-row is-${cls[st]}`}>
                  <Link className="arts-row__img" href={`/admin/artikler/${a.id}`} aria-label={`Rediger ${a.title}`}>
                    {a.featuredImage ? <img src={a.featuredImage} alt="" loading="lazy" /> : <span>Intet billede</span>}
                  </Link>
                  <div className="arts-row__main">
                    <Link className="arts-row__title" href={`/admin/artikler/${a.id}`}>
                      {a.title}
                    </Link>
                    <span className="arts-row__meta">
                      <span className={`admin-article__state is-${cls[st]}`}>{label[st]}</span>
                      {st === 'kladde' ? 'Gemt' : st === 'planlagt' ? 'Udkommer' : 'Udgivet'} {formatNumeric(when)} kl. {formatTime(when)}
                      {a.category && ` · ${cats.get(a.category) ?? a.category}`}
                      {a.tags.length > 0 && ` · ${a.tags.slice(0, 3).join(', ')}`}
                    </span>
                    <span className="arts-row__checks" aria-label={missing.length ? `Mangler: ${missing.map((c) => c.label).join(', ')}` : 'Alle SEO-tjek i orden'}>
                      {checks.map((c) => (
                        <i key={c.label} className={c.ok ? 'is-ok' : 'is-miss'} title={c.label}>
                          {c.ok ? '✓' : '!'} {c.label}
                        </i>
                      ))}
                    </span>
                  </div>
                  <dl className="arts-row__nums">
                    <div>
                      <dt>Visninger 7 d.</dt>
                      <dd>{n(f.viewsWeek)}</dd>
                    </div>
                    <div>
                      <dt>I alt</dt>
                      <dd>{n(f.views)}</dd>
                    </div>
                    <div>
                      <dt>Ord</dt>
                      <dd>{n(f.words)}</dd>
                    </div>
                  </dl>
                  <div className="arts-row__actions">
                    <Link className="pill is-active" href={`/admin/artikler/${a.id}`}>
                      {st === 'kladde' ? 'Læs og udgiv' : 'Rediger'}
                    </Link>
                    <a className="text-btn" href={paths.article(a.slug)} target="_blank" rel="noopener">
                      {st === 'udgivet' ? 'Se ↗' : 'Forhåndsvis ↗'}
                    </a>
                    {st === 'kladde' && <ActionButton body={{ action: 'mailArticle', id: a.id }} label="Send til mobilen" busyLabel="Sender …" />}
                    {st === 'udgivet' && (
                      <ActionButton body={{ action: 'shareArticle', id: a.id }} label="Del" busyLabel="Deler …" confirm={`Del "${a.title}" på sociale medier nu?`} />
                    )}
                  </div>
                  <details className="arts-row__more">
                    <summary>Detaljer</summary>
                    <ArticleFacts st={f} path={paths.article(a.slug)} />
                  </details>
                </li>
              )
            })}
          </ul>
        )}
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
