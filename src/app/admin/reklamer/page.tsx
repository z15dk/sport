import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AdminNav } from '../../../components/admin/AdminNav'
import { AdsAdmin } from '../../../components/admin/AdsAdmin'
import { isAdmin } from '../../../lib/admin'
import { adsConfig } from '../../../lib/adsConfig'
import { siteSettings } from '../../../lib/settings'
import { AD_PLACEMENTS, AD_PLACEMENT_IDS } from '../../../data/ads'
import { leads } from '../../../lib/ticketShop'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Reklamer · Admin', robots: { index: false, follow: false } }

/** The ad placements: own banners or an ad network's code (src/lib/adsConfig.ts) */
export default async function AdminAdsPage() {
  if (!(await isAdmin())) redirect('/admin')
  return (
    <div className="page">
      <div className="clubs admin">
        <AdminNav current="/admin/reklamer" />
        <h1 className="feed__title">Reklamer</h1>
        <p className="muted small">
          Fire faste pladser i standardstørrelser. Læg dit eget banner op (computer og mobil) med et link, eller sæt et annoncenetværks kode ind. Ændringer vises på siden inden for ca. 15 sekunder.
        </p>
        <AdsAdmin config={adsConfig().config} placements={AD_PLACEMENT_IDS.map((id) => AD_PLACEMENTS[id])} enabled={siteSettings().settings.ads} />
        {(() => {
          // Advertisers who asked for prices (the form on /annoncering)
          const list = leads('annoncering')
          return (
            <section className="panel">
              <h2 className="panel__title">Henvendelser om annoncering ({list.length})</h2>
              <p className="muted small pad">
                Fra formularen på <a href="/annoncering">/annoncering</a> (siden med formaterne til annoncører; linket står i sidefoden). Er SMTP sat op under Sociale medier → Indstillinger, får du også en mail pr. henvendelse.
              </p>
              {list.length > 0 && (
                <ul className="admin-list">
                  {list.map((l) => (
                    <li key={l.id}>
                      <strong>{l.club}</strong> · {l.name} · <a href={`mailto:${l.email}`}>{l.email}</a>
                      {l.phone ? ` · ${l.phone}` : ''} <span className="muted small">· {new Date(l.created).toLocaleString('da-DK', { timeZone: 'Europe/Copenhagen' })}</span>
                      {l.message && <p className="small muted">{l.message}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )
        })()}
      </div>
    </div>
  )
}
