import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { isAdmin } from '../../../lib/admin'
import { siteSettings } from '../../../lib/settings'
import { SettingToggle } from '../../../components/admin/SettingToggle'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Indstillinger · Admin', robots: { index: false, follow: false } }

/** Site settings: odds on or off */
export default async function AdminSettings() {
  if (!(await isAdmin())) redirect('/admin')
  const { settings } = siteSettings()
  return (
    <div className="page">
      <div className="clubs admin">
        <header className="admin__head">
          <h1 className="feed__title">
            Indstillinger
            <span>
              <Link href="/admin/klubber">Klubber</Link> · <Link href="/admin/kanaler">Kanaler</Link> · Indstillinger
            </span>
          </h1>
          <form method="post" action="/api/admin/logout">
            <button className="text-btn" type="submit">
              Log ud
            </button>
          </form>
        </header>
        <section className="panel prose__section">
          <h2 className="panel__title">Odds</h2>
          <SettingToggle name="odds" label="Odds på siden" value={settings.odds} />
          <p className="muted small">
            Slået fra: ingen odds, bookmaker-mærker eller &quot;Eksempel-odds&quot; nogen steder på siden. Slået til: odds vises på forsiden, i Kamp i fokus
            og på kampsiderne, altid med &quot;18+ · Spil ansvarligt · StopSpillet.dk&quot;. Odds er stadig eksempler, indtil der er en aftale med en bookmaker.
          </p>
        </section>
      </div>
    </div>
  )
}
