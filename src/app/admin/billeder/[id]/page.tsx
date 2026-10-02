import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { AdminNav } from '../../../../components/admin/AdminNav'
import { AddTag, ApproveButton, MatchEditor, RightsEditor, TagRow } from '../../../../components/admin/PhotoAdmin'
import { STATUS, dateDk, webUrl } from '../../../../components/admin/PhotoCards'
import s from '../../../../components/admin/photos.module.css'
import { isAdmin } from '../../../../lib/admin'
import { photoConfig } from '../../../../lib/photos/config'
import { FORMATS, type SomeFormat } from '../../../../lib/photos/crop'
import { withPhotoDb } from '../../../../lib/photos/server'
import { clubList, getPhoto, type Tag } from '../../../../lib/photos/store'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Billede · Admin', robots: { index: false, follow: false } }

const SOURCE: Record<string, string> = { kamp: 'holdkort', trup: 'trup', manuel: 'rettet i hånden' }

function info(t: Tag) {
  return [
    t.source === 'manuel' ? 'tilføjet/rettet i hånden' : t.nameSource ? SOURCE[t.nameSource] : undefined,
    t.confidence != null ? `tillid ${t.confidence.toFixed(2).replace('.', ',')}` : undefined,
    t.jerseyColor ? `trøje ${t.jerseyColor}` : undefined,
    t.backName ? `"${t.backName}" på ryggen` : undefined,
  ]
    .filter(Boolean)
    .join(' · ')
}

/** One photo: the players found (boxes), their tags to correct, the match, approval and SoMe crops */
export default async function AdminPhoto({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) redirect('/admin')
  const id = Number((await params).id)
  const data = Number.isInteger(id) ? withPhotoDb((db) => ({ found: getPhoto(db, id), clubs: clubList(db).map((c) => ({ id: c.id, name: c.name })) })) : undefined
  if (!data?.found) notFound()
  const { photo, tags, log } = data.found
  const defaultCredit = photoConfig().defaultCredit
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Copenhagen' })
  const boxClass = (t: Tag) => (t.side === 'egen' && t.playerName ? s.box : t.side === 'modstander' ? `${s.box} ${s.boxOpp}` : `${s.box} ${s.boxUnknown}`)
  return (
    <div className="page">
      <div className="admin">
        <AdminNav current="/admin/billeder" />
        <p>
          <Link href="/admin/billeder" className="text-btn" style={{ marginLeft: 0 }}>
            ← Alle billeder
          </Link>
        </p>
        <h1 className="feed__title">
          {photo.club ?? 'Ukendt klub'} – {photo.opponent ?? '?'}
          <span>
            {dateDk(photo.matchDate)} · {STATUS[photo.status] ?? photo.status}
            {photo.situation ? ` · ${photo.situation}` : ''}
          </span>
        </h1>
        <div className={s.detail}>
          <div>
            <div className={s.stage}>
              {(photo.processedAt || photo.source === 'artikel') && (
                // eslint-disable-next-line @next/next/no-img-element -- private admin picture from Drive via our own route
                <img src={webUrl(photo.id)} alt="" />
              )}
              {tags
                .filter((t) => t.box)
                .map((t) => (
                  <div
                    key={t.id}
                    className={boxClass(t)}
                    style={{ top: `${t.box![0] / 10}%`, left: `${t.box![1] / 10}%`, height: `${(t.box![2] - t.box![0]) / 10}%`, width: `${(t.box![3] - t.box![1]) / 10}%` }}
                  >
                    <span>#{t.number}</span>
                  </div>
                ))}
            </div>
            <div className={s.some} style={{ marginTop: 8 }}>
              Hent uden spiller (midten):
              {(Object.keys(FORMATS) as SomeFormat[]).map((f) => (
                <a key={f} className="text-btn" style={{ marginLeft: 0 }} href={`/api/admin/photos/${photo.id}/some?format=${f}`}>
                  {FORMATS[f].label}
                </a>
              ))}
            </div>
            <p className={s.muted}>
              {photo.path}
              {photo.takenAt ? ` · taget ${photo.takenAt.replace('T', ' ')}` : ' · ingen optagelsesdato i filen'}
              {photo.width ? ` · original ${photo.width}×${photo.height}` : ''}
            </p>
          </div>
          <div className={s.side}>
            {photo.error && <p className={s.error}>{photo.error}</p>}
            {photo.status === 'slettet' && <p className={s.error}>Slettet: {String(data.found.row.deleted_reason ?? 'låneperioden udløb')}</p>}
            {!photo.metadataDone && <p className={s.note}>Billedet er brugt i en artikel, men mangler rettigheder og kamp. Udfyld Rettigheder og Kamp nedenfor.</p>}
            {photo.status === 'ny' && <p className={s.muted}>I kø: numre og navne findes ved næste Sync eller natkørsel.</p>}
            {photo.review && photo.status === 'tagget' && <p className={s.note}>Til gennemgang: {photo.reviewReasons.join(', ')}</p>}
            {(photo.status === 'tagget' || photo.status === 'godkendt') && <ApproveButton photoId={photo.id} approved={photo.status === 'godkendt'} />}
            <h2>Spillere</h2>
            {tags.length === 0 && <p className={s.muted}>Ingen numre fundet. Tilføj dem nedenfor.</p>}
            {tags.map((t) => (
              <TagRow key={t.id} photoId={photo.id} tag={{ id: t.id, number: t.number, playerName: t.playerName, side: t.side, note: t.note, info: info(t) }} />
            ))}
            <AddTag photoId={photo.id} />
            <h2>Rettigheder</h2>
            <p className={s.muted} style={{ margin: 0 }}>
              Foto: <b>{photo.credit ?? defaultCredit}</b>
              {photo.licenseUntil ? ` · lånt til og med ${dateDk(photo.licenseUntil)} – slettes derefter automatisk` : ' · vores eget billede'}
            </p>
            <RightsEditor photoId={photo.id} credit={photo.credit} licenseUntil={photo.licenseUntil} defaultCredit={defaultCredit} today={today} />
            <h2>Kamp</h2>
            <p className={s.muted}>Ret klub, modstander eller dato: navnene findes igen ud fra kampens holdkort og truppen (uden nyt AI-kald). Rettede spillere bevares.</p>
            <MatchEditor photoId={photo.id} clubId={photo.clubId} opponentId={photo.opponentId} date={photo.matchDate} clubs={data.clubs} />
            <details>
              <summary className={s.muted}>Log</summary>
              <ul className={s.muted}>
                {log.map((l, i) => (
                  <li key={i}>
                    {String(l.at).slice(0, 19).replace('T', ' ')} {String(l.step)} {l.ok ? '' : 'FEJL'} {l.ms != null ? `${String(l.ms)} ms` : ''} {l.message ? String(l.message) : ''}
                  </li>
                ))}
              </ul>
            </details>
          </div>
        </div>
      </div>
    </div>
  )
}
