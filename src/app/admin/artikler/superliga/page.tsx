import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AdminNav } from '../../../../components/admin/AdminNav'
import { SuperligaArticleButton } from '../../../../components/admin/SuperligaArticleButton'
import { isAdmin } from '../../../../lib/admin'
import { allArticles } from '../../../../lib/articles'
import { SUPERLIGA_KINDS, superligaArticle } from '../../../../lib/superligaArticles'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Superliga-artikler · Artikler · Admin', robots: { index: false, follow: false } }

/** Three long Superliga articles written from this season's data: saved as drafts, published by hand */
export default async function AdminSuperligaArticles() {
  if (!(await isAdmin())) redirect('/admin')
  const saved = allArticles()
  const rows = SUPERLIGA_KINDS.map((k) => {
    const { article, error } = superligaArticle(k.kind)
    return { ...k, article, error, draft: saved.find((a) => a.slug === k.slug) }
  })
  return (
    <div className="page">
      <div className="clubs admin">
        <AdminNav current="/admin/artikler/superliga" />
        <h1 className="feed__title">
          Superliga-artikler
          <span>Skrevet ud fra sæsonens rigtige kampe · gemmes som kladder</span>
        </h1>
        <div className="panel" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ margin: 0 }}>
            Tre lange artikler om Superligaen: sæsonen i tal, formtabellen og kampen om top 6. Hver sætning bygger på sæsonens resultater, pauseresultater, målminutter, målscorere, kort og tilskuere – mangler tallene, udelades sætningen.
            Artiklerne gemmes som <strong>kladder</strong>: læs dem, giv dem et udvalgt billede og udgiv dem i artikel-editoren. Tryk igen efter en ny runde for at opdatere tallene; en udgivet artikel røres ikke.
          </p>
          <SuperligaArticleButton label="Lav alle tre kladder" primary />
        </div>
        <ul className="admin-list">
          {rows.map((r) => (
            <li key={r.kind} className="admin-list__row" style={{ gridTemplateColumns: 'minmax(0, 1fr) auto' }}>
              <span className="admin-list__name">
                {r.article?.title ?? r.label}
                <em>{r.error ?? r.article?.excerpt}</em>
              </span>
              <span style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {r.draft && (
                  <Link className="text-btn" style={{ marginLeft: 0 }} href={`/admin/artikler/${r.draft.id}`}>
                    {r.draft.status === 'published' ? 'Udgivet – åbn' : 'Kladde – læs og udgiv'}
                  </Link>
                )}
                {r.article && r.draft?.status !== 'published' && <SuperligaArticleButton kinds={[r.kind]} label={r.draft ? 'Opdater kladde' : 'Lav kladde'} />}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
