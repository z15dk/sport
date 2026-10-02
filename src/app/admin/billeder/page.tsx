import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AdminNav } from '../../../components/admin/AdminNav'
import { AutoFilterForm, BulkBar, SyncButton } from '../../../components/admin/PhotoAdmin'
import { Legend, PhotoCard } from '../../../components/admin/PhotoCards'
import s from '../../../components/admin/photos.module.css'
import { isAdmin } from '../../../lib/admin'
import { photoConfig } from '../../../lib/photos/config'
import { syncRequested, withPhotoDb } from '../../../lib/photos/server'
import { getMeta } from '../../../lib/photos/db'
import { KINDS, type Kind } from '../../../lib/photos/kinds'
import { burstsOf, clubList, filterOptions, overview, searchPhotos, tagsFor } from '../../../lib/photos/store'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Billeder · Admin', robots: { index: false, follow: false } }

type SearchParams = Promise<{ q?: string; status?: string; klub?: string; modstander?: string; situation?: string; spiller?: string; fra?: string; til?: string; ids?: string; type?: string; tag?: string }>

/** The owner's match photos: search by club and number, name, match or situation */
export default async function AdminPhotos({ searchParams }: { searchParams: SearchParams }) {
  if (!(await isAdmin())) redirect('/admin')
  const { q = '', status = '', klub = '', modstander = '', situation = '', spiller = '', fra = '', til = '', ids = '', type = '', tag = '' } = await searchParams
  const only = ids.split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0)
  const cfg = photoConfig()
  const { info, photos, tags, options, clubs, report } = withPhotoDb((db) => {
    const photos = searchPhotos(db, q, status, 200, { clubId: klub, opponentId: modstander, situation, player: spiller, from: fra, to: til, ids: only, kind: type, tag })
    const last = getMeta(db, 'report_last')
    return {
      info: overview(db, cfg.dailyLimit),
      photos,
      tags: tagsFor(db, photos.map((p) => p.id)),
      options: filterOptions(db, klub || undefined),
      clubs: clubList(db).map((c) => ({ id: c.id, name: c.name })),
      report: last ? (JSON.parse(last) as { at: string; sent: string; text: string }) : undefined,
    }
  })
  // Bursts: show the sharpest of each, the rest behind its "Serie" badge (all of them when a burst is opened)
  const bursts = burstsOf(photos)
  const shown = only.length ? photos : photos.filter((p) => !bursts.has(p.id) || bursts.get(p.id)![0] === p.id)
  const filtered = !!(q || status || klub || modstander || situation || spiller || fra || til || ids || type || tag)
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
        {report && (
          <details className={s.report}>
            <summary>
              Morgenrapport {new Date(report.at).toLocaleString('da-DK', { timeZone: 'Europe/Copenhagen', dateStyle: 'short', timeStyle: 'short' })} · {report.sent}
            </summary>
            <pre style={{ whiteSpace: 'pre-wrap', font: 'inherit', margin: '8px 0 0' }}>{report.text}</pre>
          </details>
        )}

        <AutoFilterForm className="panel admin-filter" style={{ margin: '14px 0' }}>
          <input type="search" name="q" defaultValue={q} placeholder="Søg: Brabrand 9, Bryld, jubel, titel, tag" aria-label="Søg" />
          <select name="klub" defaultValue={klub} aria-label="Klub">
            <option value="">Alle klubber</option>
            {options.clubs.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label} ({o.n})
              </option>
            ))}
          </select>
          <select name="modstander" defaultValue={modstander} aria-label="Modstander">
            <option value="">Alle modstandere</option>
            {options.opponents.map((o) => (
              <option key={o.value} value={o.value}>
                mod {o.label} ({o.n})
              </option>
            ))}
          </select>
          <select name="type" defaultValue={type} aria-label="Billedtype">
            <option value="">Alle typer</option>
            {options.kinds.map((o) => (
              <option key={o.value} value={o.value}>
                {KINDS[o.value as Kind] ?? o.value} ({o.n})
              </option>
            ))}
          </select>
          {options.tags.length > 0 && (
            <select name="tag" defaultValue={tag} aria-label="Tag">
              <option value="">Alle tags</option>
              {options.tags.map((o) => (
                <option key={o.value} value={o.value}>
                  #{o.label} ({o.n})
                </option>
              ))}
            </select>
          )}
          <select name="situation" defaultValue={situation} aria-label="Situation">
            <option value="">Alle situationer</option>
            {options.situations.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label} ({o.n})
              </option>
            ))}
          </select>
          <select name="spiller" defaultValue={spiller} aria-label="Spiller">
            <option value="">{klub ? 'Alle spillere i klubben' : 'Alle spillere'}</option>
            {options.players.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label} ({o.n})
              </option>
            ))}
          </select>
          <label className={s.muted} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            Fra <input type="date" name="fra" defaultValue={fra} aria-label="Fra dato" style={{ flex: '0 0 auto' }} />
          </label>
          <label className={s.muted} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            Til <input type="date" name="til" defaultValue={til} aria-label="Til dato" style={{ flex: '0 0 auto' }} />
          </label>
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
          {filtered && (
            <Link href="/admin/billeder" className="text-btn" style={{ marginLeft: 0 }}>
              Nulstil
            </Link>
          )}
        </AutoFilterForm>
        <Legend />
        <BulkBar clubs={clubs} />
        <p className={s.muted}>
          {only.length ? 'Serieskud – det skarpeste står først · ' : ''}
          {shown.length} billede{shown.length === 1 ? '' : 'r'}
          {shown.length < photos.length ? ` (${photos.length - shown.length} lignende i serier)` : ''}
          {q ? ` for "${q}" – et nummer viser kun klubbens egne spillere` : ''}
          {photos.length === 200 ? ' (de 200 nyeste – filtrér mere for at se resten)' : ''}
        </p>
        <div className={s.grid}>
          {(only.length ? [...photos].sort((a, b) => only.indexOf(a.id) - only.indexOf(b.id)) : shown).map((p) => (
            <PhotoCard key={p.id} photo={p} tags={tags.get(p.id) ?? []} burst={only.length ? undefined : bursts.get(p.id)} />
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
