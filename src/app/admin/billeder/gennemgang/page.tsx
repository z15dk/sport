import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AdminNav } from '../../../../components/admin/AdminNav'
import { ApproveButton, SuggestionButton } from '../../../../components/admin/PhotoAdmin'
import { TagChip, dateDk, thumbUrl } from '../../../../components/admin/PhotoCards'
import s from '../../../../components/admin/photos.module.css'
import { isAdmin } from '../../../../lib/admin'
import { withPhotoDb } from '../../../../lib/photos/server'
import { reviewQueue } from '../../../../lib/photos/store'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Gennemgang · Billeder · Admin', robots: { index: false, follow: false } }

/** Photos with low confidence, unknown names or teams, or no numbers – quickest to fix first */
export default async function AdminPhotoReview() {
  if (!(await isAdmin())) redirect('/admin')
  const queue = withPhotoDb((db) => reviewQueue(db))
  return (
    <div className="page">
      <div className="clubs admin">
        <AdminNav current="/admin/billeder/gennemgang" />
        <h1 className="feed__title">
          Gennemgang
          <span>{queue.length} billeder · hurtigste at rette først</span>
        </h1>
        {queue.length === 0 && <p className="panel" style={{ padding: 14 }}>Intet at gennemgå. Nye usikre billeder lander her.</p>}
        <div className={s.queue}>
          {queue.map(({ photo, tags, suggestions }) => (
            <div key={photo.id} className={s.qrow}>
              <Link href={`/admin/billeder/${photo.id}`} prefetch={false}>
                {/* eslint-disable-next-line @next/next/no-img-element -- private admin thumbnail */}
                <img src={thumbUrl(photo.id)} alt="" loading="lazy" />
              </Link>
              <div className={s.qtext}>
                <Link href={`/admin/billeder/${photo.id}`} prefetch={false} className={s.cardTitle}>
                  {photo.club ? `${photo.club} – ${photo.opponent ?? '?'}` : photo.source === 'artikel' ? 'Artikelbillede' : 'Ukendt klub'} · {dateDk(photo.matchDate)}
                </Link>
                <span className={s.chips}>{tags.map((t) => <TagChip key={t.id} tag={t} />)}</span>
                {tags.filter((t) => t.note).map((t) => (
                  <span key={t.id} className={s.note}>
                    #{t.number}: {t.note}
                  </span>
                ))}
                <span className={s.muted}>{[...(!photo.metadataDone ? ['mangler metadata (artikelbillede)'] : []), ...photo.reviewReasons.filter((r) => r && r !== 'mangler metadata')].join(' · ')}</span>
              </div>
              <div className={s.qactions}>
                {suggestions.map((sg) => {
                  const tag = tags.find((t) => t.id === sg.tagId)
                  return (
                    <span key={sg.tagId} className={s.muted}>
                      #{tag?.number} er måske <SuggestionButton {...sg} />
                    </span>
                  )
                })}
                <Link className="pill" href={`/admin/billeder/${photo.id}`} prefetch={false}>
                  Ret
                </Link>
                {photo.status === 'tagget' && <ApproveButton photoId={photo.id} approved={false} />}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
