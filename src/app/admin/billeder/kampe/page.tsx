import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AdminNav } from '../../../../components/admin/AdminNav'
import { CopyButton } from '../../../../components/admin/PhotoAdmin'
import { dateDk, thumbUrl } from '../../../../components/admin/PhotoCards'
import s from '../../../../components/admin/photos.module.css'
import { isAdmin } from '../../../../lib/admin'
import { photoConfig } from '../../../../lib/photos/config'
import { FORMATS, type SomeFormat } from '../../../../lib/photos/crop'
import { withPhotoDb } from '../../../../lib/photos/server'
import { matchOverview } from '../../../../lib/photos/store'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Kampe og opslag · Billeder · Admin', robots: { index: false, follow: false } }

/** Per match: result and scorers from DBU, a ready post with a photo of a scorer, and "best of the match" as a ZIP */
export default async function AdminPhotoMatches() {
  if (!(await isAdmin())) redirect('/admin')
  const matches = withPhotoDb((db) => matchOverview(db, photoConfig().defaultCredit))
  return (
    <div className="page">
      <div className="clubs admin">
        <AdminNav current="/admin/billeder/kampe" />
        <h1 className="feed__title">
          Kampe og opslag
          <span>resultat og målscorere fra DBU · kun godkendte og sikre billeder bruges</span>
        </h1>
        {matches.length === 0 && <p className="panel" style={{ padding: 14 }}>Ingen kampe med billeder endnu.</p>}
        <div className={s.queue}>
          {matches.map((m) => {
            const params = `klub=${encodeURIComponent(m.clubId)}&dato=${m.date}&modstander=${encodeURIComponent(m.opponentId ?? '')}`
            return (
              <div key={`${m.clubId}|${m.date}|${m.opponentId}`} className={s.matchCard}>
                <div>
                  {m.postPhotoId ? (
                    <Link href={`/admin/billeder/${m.postPhotoId}`} prefetch={false}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- private admin thumbnail */}
                      <img src={thumbUrl(m.postPhotoId)} alt="" loading="lazy" />
                    </Link>
                  ) : (
                    <div className={s.thumb} style={{ aspectRatio: '4 / 5', borderRadius: 8 }} />
                  )}
                  {m.postPhotoId && (
                    <p className={s.muted} style={{ margin: '6px 0 0' }}>
                      {m.postScorer ? `Målscorer: ${m.postScorer}` : 'Intet billede af en målscorer – bedste jubel/billede'} ·{' '}
                      <a className="text-btn" style={{ marginLeft: 0 }} href={`/api/admin/photos/${m.postPhotoId}/some?format=post`}>
                        Hent 4:5
                      </a>
                    </p>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
                  <div>
                    <b>
                      {m.club} – {m.opponent}
                    </b>{' '}
                    <span className={s.muted}>
                      {dateDk(m.date)} · {m.count} billeder, {m.safe} klar{m.review ? `, ${m.review} til gennemgang` : ''}
                    </span>
                  </div>
                  {m.post ? (
                    <>
                      <textarea className={s.post} defaultValue={m.post} aria-label="Opslagstekst" />
                      <span className={s.some}>
                        <CopyButton text={m.post} />
                        {m.scorerPhotos.map((sp) => (
                          <Link key={sp.name} className="text-btn" style={{ marginLeft: 0 }} href={`/admin/billeder?spiller=${encodeURIComponent(sp.name)}&klub=${encodeURIComponent(m.clubId)}&fra=${m.date}&til=${m.date}`} prefetch={false}>
                            {sp.name} ({sp.ids.length})
                          </Link>
                        ))}
                      </span>
                    </>
                  ) : (
                    <p className={s.muted}>Intet resultat fra DBU for kampen på den dato – tjek kampens dato og modstander.</p>
                  )}
                  <span className={s.some}>
                    Kampens bedste (op til 10, zip):
                    {(Object.keys(FORMATS) as SomeFormat[]).map((f) => (
                      <a key={f} className="text-btn" style={{ marginLeft: 0 }} href={`/api/admin/photos/pakke?${params}&format=${f}`}>
                        {FORMATS[f].label}
                      </a>
                    ))}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
