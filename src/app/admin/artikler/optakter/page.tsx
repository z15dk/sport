import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AdminNav } from '../../../../components/admin/AdminNav'
import { PreviewButton } from '../../../../components/admin/PreviewAdmin'
import { isAdmin } from '../../../../lib/admin'
import { dkDate } from '../../../../lib/previews/build'
import { upcomingFixtures } from '../../../../lib/previews/data'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Optakter · Artikler · Admin', robots: { index: false, follow: false } }

/** Match previews for 1. division: written from data as drafts, published by hand */
export default async function AdminPreviews() {
  if (!(await isAdmin())) redirect('/admin')
  const fixtures = upcomingFixtures(14)
  return (
    <div className="page">
      <div className="clubs admin">
        <AdminNav current="/admin/artikler/optakter" />
        <h1 className="feed__title">
          Optakter
          <span>1. division · de næste 14 dage · skrevet ud fra kampdata som kladder</span>
        </h1>
        <div className="panel" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ margin: 0 }}>
            Hver optakt bygges af kampprogrammet (tid, stadion, TV), sæsonens resultater og målscorere og de indbyrdes opgør siden 2001, med spørgsmål og korte svar til Google og AI-søgning.
            Optakterne gemmes som <strong>kladder</strong> – læs dem igennem og udgiv dem i artikel-editoren. En udgivet optakt røres ikke igen.
          </p>
          <PreviewButton days={7} label="Lav kladder til de næste 7 dage" primary />
        </div>
        {fixtures.length === 0 && <p className="panel" style={{ padding: 16 }}>Ingen kampe i 1. division de næste 14 dage (DBU's kampprogram hentes hver 3. nat).</p>}
        <ul className="admin-list">
          {fixtures.map((f) => (
            <li key={f.key} className="admin-list__row" style={{ gridTemplateColumns: 'minmax(0, 1fr) auto' }}>
              <span className="admin-list__name">
                {f.home.name} – {f.away.name}
                <em>
                  {dkDate(f.date)}
                  {f.time ? ` kl. ${f.time.replace(':', '.')}` : ''}
                  {f.venue ? ` · ${f.venue}` : ''}
                  {f.tv ? ` · ${f.tv}` : ''}
                </em>
              </span>
              <span style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {f.draft && (
                  <Link className="text-btn" style={{ marginLeft: 0 }} href={`/admin/artikler/${f.draft.id}`}>
                    {f.draft.status === 'published' ? 'Udgivet – åbn' : 'Kladde – læs og udgiv'}
                  </Link>
                )}
                {f.draft?.status !== 'published' && <PreviewButton keys={[f.key]} label={f.draft ? 'Opdater kladde' : 'Lav kladde'} />}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
