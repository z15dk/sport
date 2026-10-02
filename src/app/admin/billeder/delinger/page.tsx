import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AdminNav } from '../../../../components/admin/AdminNav'
import { RevokeShare } from '../../../../components/admin/PhotoAdmin'
import s from '../../../../components/admin/photos.module.css'
import { isAdmin } from '../../../../lib/admin'
import { withPhotoDb } from '../../../../lib/photos/server'
import { shareList } from '../../../../lib/photos/store'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Delinger · Billeder · Admin', robots: { index: false, follow: false } }

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('da-DK', { timeZone: 'Europe/Copenhagen', dateStyle: 'short', timeStyle: 'short' }) : '–')

/** Private links to photos for clubs and players; made from the selection on the search page */
export default async function AdminShares() {
  if (!(await isAdmin())) redirect('/admin')
  const shares = withPhotoDb((db) => shareList(db))
  return (
    <div className="page">
      <div className="clubs admin">
        <AdminNav current="/admin/billeder/delinger" />
        <h1 className="feed__title">
          Delinger
          <span>private links – lav dem ved at vælge billeder under Søg og trykke Del</span>
        </h1>
        <p className={s.muted}>Linket vises kun, når det laves (det gemmes ikke her). Lånte billeder deles aldrig.</p>
        <table className={s.table}>
          <thead>
            <tr>
              <th>Titel</th>
              <th>Billeder</th>
              <th>Lavet</th>
              <th>Udløber</th>
              <th>Set</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shares.map((sh) => (
              <tr key={sh.id}>
                <td>{sh.title}</td>
                <td className={s.num}>{sh.count}</td>
                <td>{when(sh.createdAt)}</td>
                <td>{sh.revoked ? 'lukket' : sh.active ? when(sh.expiresAt) : 'udløbet'}</td>
                <td>
                  {sh.views}× {sh.lastViewAt ? <span className={s.muted}>(senest {when(sh.lastViewAt)})</span> : null}
                </td>
                <td>{sh.active && <RevokeShare id={sh.id} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
