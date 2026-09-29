import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AdminNav } from '../../../components/admin/AdminNav'
import { WomenPageAdmin } from '../../../components/admin/WomenPageAdmin'
import { defaultLead, womenSport } from '../../../components/WomenLanding'
import { isAdmin } from '../../../lib/admin'
import { womenPage } from '../../../lib/womenPage'
import { getMatches, isWomenMatch } from '../../../data/matches'
import { addDays, isoDate } from '../../../lib/time'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Kvindesport · Admin', robots: { index: false, follow: false } }

/** The women's sport pages' top: picture and texts (src/lib/womenPage.ts) */
export default async function AdminWomenPage() {
  if (!(await isAdmin())) redirect('/admin')
  const now = Date.now()
  const today = isoDate(now)
  const days = Array.from({ length: 29 }, (_, i) => getMatches(addDays(today, i - 14), 'all', now).filter(isWomenMatch))
  const todays = days[14]
  const numbers = {
    liveNow: todays.filter((m) => m.state === 'live').length,
    todayCount: todays.length,
    played: days.slice(0, 15).flat().filter((m) => m.state === 'finished').length,
    leagues: new Set(days.flat().map((m) => m.leagueId)).size,
    sports: new Set(days.flat().map((m) => m.sport)).size,
  }
  return (
    <div className="page">
      <div className="clubs admin">
        <AdminNav current="/admin/kvindesport" />
        <h1 className="feed__title">Kvindesport</h1>
        <p className="muted small">
          Toppen på <Link href="/kvindesport">/kvindesport</Link>, siderne for hver sport og <Link href="/kvindefodbold">/kvindefodbold</Link>. Ændringer vises med det
          samme.
        </p>
        <WomenPageAdmin page={womenPage()} defaultLead={defaultLead(womenSport()!)} numbers={numbers} />
      </div>
    </div>
  )
}
