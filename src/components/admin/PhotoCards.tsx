import Link from 'next/link'
import type { Photo, Tag } from '../../lib/photos/store'
import s from './photos.module.css'

// Shared pieces of the photo admin's server-rendered pages

export const STATUS: Record<string, string> = {
  ny: 'I kø',
  behandles: 'Behandles',
  tagget: 'Tagget',
  godkendt: 'Godkendt',
  fejl: 'Fejl',
  arkiveret: 'Arkiveret',
}

export const dateDk = (iso: string | null) => (iso ? `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))} ${iso.slice(0, 4)}` : 'ukendt dato')

export const thumbUrl = (id: number) => `/api/admin/photos/${id}/billede?v=thumb`
export const webUrl = (id: number) => `/api/admin/photos/${id}/billede?v=web`

export function TagChip({ tag }: { tag: Tag }) {
  const cls = tag.side === 'egen' && tag.playerName ? s.own : tag.side === 'modstander' ? s.opp : s.unknown
  const text = tag.side === 'modstander' ? `#${tag.number ?? '?'} modst.` : `#${tag.number ?? '?'} ${tag.playerName ?? '?'}`
  return <span className={`${s.chip} ${cls}`}>{text}</span>
}

export function Legend() {
  return (
    <div className={s.legend}>
      <span className={`${s.chip} ${s.own}`}>egen klub med navn</span>
      <span className={`${s.chip} ${s.opp}`}>modstander</span>
      <span className={`${s.chip} ${s.unknown}`}>navn eller hold ukendt</span>
    </div>
  )
}

export function PhotoCard({ photo, tags }: { photo: Photo; tags: Tag[] }) {
  return (
    <Link href={`/admin/billeder/${photo.id}`} className={s.card} prefetch={false}>
      {photo.processedAt ? (
        // eslint-disable-next-line @next/next/no-img-element -- private admin thumbnails, already sized
        <img className={s.thumb} src={thumbUrl(photo.id)} alt="" loading="lazy" />
      ) : (
        <div className={s.thumb} />
      )}
      <div className={s.cardBody}>
        <span className={s.cardTitle}>
          {photo.club ?? 'Ukendt klub'} – {photo.opponent ?? '?'}
        </span>
        <span className={s.muted}>{dateDk(photo.matchDate)}</span>
        <span className={s.chips}>{tags.length ? tags.map((t) => <TagChip key={t.id} tag={t} />) : <span className={s.muted}>ingen numre</span>}</span>
        <span className={photo.status === 'godkendt' ? s.approved : s.muted}>
          {STATUS[photo.status] ?? photo.status}
          {photo.review && photo.status === 'tagget' ? ' · til gennemgang' : ''}
          {photo.situation ? ` · ${photo.situation}` : ''}
        </span>
      </div>
    </Link>
  )
}
