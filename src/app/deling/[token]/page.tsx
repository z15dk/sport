import type { Metadata } from 'next'
import s from '../../../components/admin/photos.module.css'
import { photoConfig } from '../../../lib/photos/config'
import { withPhotoDb } from '../../../lib/photos/server'
import { openShare } from '../../../lib/photos/store'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Billeder fra Matchly', robots: { index: false, follow: false } }

const dk = (iso: string) => new Date(iso).toLocaleDateString('da-DK', { timeZone: 'Europe/Copenhagen', day: 'numeric', month: 'long', year: 'numeric' })

/** A private gallery for a club or player, from a link made in the photo admin; closes by itself */
export default async function SharedPhotos({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const share = withPhotoDb((db) => openShare(db, token, true))
  if (!share || share.expired) {
    return (
      <div className="page">
        <h1 className="feed__title">Linket er lukket</h1>
        <p className="panel" style={{ padding: 14 }}>
          Linket til billederne er udløbet eller lukket. Skriv til info@matchly.dk, hvis du har brug for dem.
        </p>
      </div>
    )
  }
  return (
    <div className="page">
      <h1 className="feed__title">
        {share.title}
        <span>
          {share.photos.length} billeder · linket virker til {dk(share.expiresAt)}
        </span>
      </h1>
      <p className={s.some}>
        <a className="pill is-active" href={`/deling/${token}/alle`}>
          Hent alle (zip)
        </a>
        <span className={s.muted}>Foto: {photoConfig().defaultCredit} – nævn venligst fotografen, når billederne bruges.</span>
      </p>
      <div className={s.grid}>
        {share.photos.map((p) => (
          <a key={p.id} className={s.card} href={`/deling/${token}/${p.id}?v=jpg`} download>
            {/* eslint-disable-next-line @next/next/no-img-element -- private shared thumbnail */}
            <img className={s.thumb} src={`/deling/${token}/${p.id}?v=thumb`} alt="" loading="lazy" />
            <span className={s.cardBody}>
              <span className={s.cardTitle}>
                {p.club} – {p.opponent}
              </span>
              <span className={s.muted}>Tryk for at hente</span>
            </span>
          </a>
        ))}
      </div>
    </div>
  )
}
