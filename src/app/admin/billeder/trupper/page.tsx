import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AdminNav } from '../../../../components/admin/AdminNav'
import { ClubEditor, SquadAdd, SquadDelete } from '../../../../components/admin/PhotoAdmin'
import s from '../../../../components/admin/photos.module.css'
import { isAdmin } from '../../../../lib/admin'
import { withPhotoDb } from '../../../../lib/photos/server'
import { clubList, squadFor } from '../../../../lib/photos/store'
import { getMeta } from '../../../../lib/photos/db'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Trupper · Billeder · Admin', robots: { index: false, follow: false } }

type SearchParams = Promise<{ klub?: string }>

const dk = (d: string | null) => (d ? `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}` : '')

/** Each club's squad (from DBU's team sheets plus corrections), kits and other names */
export default async function AdminSquads({ searchParams }: { searchParams: SearchParams }) {
  if (!(await isAdmin())) redirect('/admin')
  const { klub = '' } = await searchParams
  const { clubs, squad, dbu } = withPhotoDb((db) => {
    const clubs = clubList(db)
    const id = klub || clubs[0]?.id || ''
    return { clubs, squad: id ? squadFor(db, id) : [], dbu: getMeta(db, 'dbu_synced_at') }
  })
  const club = clubs.find((c) => c.id === klub) ?? clubs[0]
  return (
    <div className="page">
      <div className="admin">
        <AdminNav current="/admin/billeder/trupper" />
        <h1 className="feed__title">
          Trupper
          <span>fra DBU's holdkort · hentet {dbu ? new Date(dbu).toLocaleString('da-DK', { timeZone: 'Europe/Copenhagen', dateStyle: 'short', timeStyle: 'short' }) : 'aldrig'}</span>
        </h1>
        <form className="panel admin-filter" method="get">
          <select name="klub" defaultValue={club?.id} aria-label="Klub">
            {clubs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button className="pill is-active">Vis</button>
        </form>
        {club && (
          <>
            <div className="panel" style={{ padding: 12, margin: '12px 0' }}>
              <p style={{ margin: '0 0 8px' }}>
                <b>{club.name}</b> · hjemmebane (DBU): trøje {club.kit?.shirt || club.colors.join('/') || '?'}, shorts {club.kit?.shorts || '?'}, strømper {club.kit?.socks || '?'}
              </p>
              <p className={s.muted} style={{ margin: '0 0 8px' }}>
                Udebanetrøjer bruges også i farvetjekket. Andre navne gør, at mappenavne som "Brabrand IF" findes.
              </p>
              <ClubEditor clubId={club.id} extraColors={club.extraColors} aliases={club.aliases} />
            </div>
            <p className={s.muted}>
              En rettelse vinder over holdkortenes rækker for samme nummer. Rækker fra DBU opdateres selv hver nat.
            </p>
            <SquadAdd clubId={club.id} />
            <table className={s.table} style={{ marginTop: 12 }}>
              <thead>
                <tr>
                  <th>Nr.</th>
                  <th>Navn</th>
                  <th>Fra</th>
                  <th>Til</th>
                  <th>Kilde</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {squad.map((r) => (
                  <tr key={r.id}>
                    <td className={s.num}>{r.number}</td>
                    <td>
                      {r.name}
                      {r.uncertain && <span className={`${s.chip} ${s.unknown}`} style={{ marginLeft: 6 }}>usikker</span>}
                    </td>
                    <td>{dk(r.validFrom)}</td>
                    <td>{dk(r.validTo) || 'nu'}</td>
                    <td className={s.muted}>{r.source === 'manuel' ? 'rettelse' : 'DBU'}</td>
                    <td>{r.source === 'manuel' && <SquadDelete id={r.id} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  )
}
