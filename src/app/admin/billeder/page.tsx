import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AdminNav } from '../../../components/admin/AdminNav'
import { SyncButton } from '../../../components/admin/PhotoAdmin'
import { Legend, PhotoCard } from '../../../components/admin/PhotoCards'
import s from '../../../components/admin/photos.module.css'
import { isAdmin } from '../../../lib/admin'
import { photoConfig } from '../../../lib/photos/config'
import { syncRequested, withPhotoDb } from '../../../lib/photos/server'
import { overview, searchPhotos, tagsFor } from '../../../lib/photos/store'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Billeder · Admin', robots: { index: false, follow: false } }

type SearchParams = Promise<{ q?: string; status?: string }>

/** The owner's match photos: search by club and number, name, match or situation */
export default async function AdminPhotos({ searchParams }: { searchParams: SearchParams }) {
  if (!(await isAdmin())) redirect('/admin')
  const { q = '', status = '' } = await searchParams
  const cfg = photoConfig()
  const { info, photos, tags } = withPhotoDb((db) => {
    const photos = searchPhotos(db, q, status)
    return { info: overview(db, cfg.dailyLimit), photos, tags: tagsFor(db, photos.map((p) => p.id)) }
  })
  const c = info.counts
  return (
    <div className="page">
      <div className="admin">
        <AdminNav current="/admin/billeder" />
        <h1 className="feed__title">
          Billeder
          <span>
            {info.total} billeder · sidste kørsel {info.lastRun?.finishedAt ? new Date(info.lastRun.finishedAt).toLocaleString('da-DK', { timeZone: 'Europe/Copenhagen', dateStyle: 'short', timeStyle: 'short' }) : 'aldrig'}
          </span>
        </h1>
        <p style={{ margin: '0 0 12px' }}>
          <SyncButton running={info.running} requested={syncRequested()} />
        </p>
        <div className={s.stats}>
          <div className={s.stat}><b>{(c.tagget ?? 0) + (c.godkendt ?? 0)}</b><span>tagget ({c.godkendt ?? 0} godkendt)</span></div>
          <div className={s.stat}><b>{info.review}</b><span><Link href="/admin/billeder/gennemgang">til gennemgang</Link></span></div>
          <div className={s.stat}><b>{c.ny ?? 0}</b><span>i kø</span></div>
          <div className={s.stat}><b className={c.fejl ? s.warn : undefined}>{c.fejl ?? 0}</b><span><Link href="/admin/billeder?status=fejl">fejl</Link></span></div>
          <div className={s.stat}><b className={info.expiring ? s.warn : undefined}>{info.expiring}</b><span><Link href="/admin/billeder?status=udloeber">lån udløber ≤ 14 dage</Link></span></div>
          <div className={s.stat}><b>{info.quota.calls}/{info.quota.dailyLimit}</b><span>AI-kald i dag{info.quota.limited ? ` · ${info.quota.limited}× kvote` : ''}</span></div>
        </div>
        {info.lastRun?.stoppedBecause && <p className={s.note}>Seneste kørsel stoppede: {info.lastRun.stoppedBecause}</p>}

        <form className="panel admin-filter" method="get" style={{ margin: '14px 0' }}>
          <input type="search" name="q" defaultValue={q} placeholder="Fx Brabrand 9, Bryld, Skive jubel" aria-label="Søg" />
          <select name="status" defaultValue={status} aria-label="Status">
            <option value="">Alle behandlede</option>
            <option value="tagget">Tagget</option>
            <option value="godkendt">Godkendt</option>
            <option value="gennemgang">Til gennemgang</option>
            <option value="laant">Lånte billeder</option>
            <option value="udloeber">Lån udløber snart</option>
            <option value="fejl">Fejl</option>
            <option value="slettet">Slettet (lån udløbet)</option>
            <option value="ny">I kø</option>
          </select>
          <button className="pill is-active">Søg</button>
        </form>
        <Legend />
        <p className={s.muted}>
          {photos.length} billede{photos.length === 1 ? '' : 'r'}
          {q ? ` for "${q}" – et nummer viser kun klubbens egne spillere` : ''}
        </p>
        <div className={s.grid}>
          {photos.map((p) => (
            <PhotoCard key={p.id} photo={p} tags={tags.get(p.id) ?? []} />
          ))}
        </div>
        {status === 'fejl' && photos.length > 0 && (
          <ul className={s.muted}>
            {photos.map((p) => (
              <li key={p.id}>
                {p.path}: {p.error}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
