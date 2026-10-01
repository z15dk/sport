import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AdminNav } from '../../../components/admin/AdminNav'
import { AdsAdmin } from '../../../components/admin/AdsAdmin'
import { isAdmin } from '../../../lib/admin'
import { adsConfig } from '../../../lib/adsConfig'
import { siteSettings } from '../../../lib/settings'
import { AD_PLACEMENTS, AD_PLACEMENT_IDS } from '../../../data/ads'

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
      </div>
    </div>
  )
}
