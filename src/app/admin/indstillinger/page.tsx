import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { isAdmin } from '../../../lib/admin'
import { siteSettings } from '../../../lib/settings'
import { SETTINGS } from '../../../data/settingsDef'
import { SettingToggle } from '../../../components/admin/SettingToggle'
import { AdminNav } from '../../../components/admin/AdminNav'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Indstillinger · Admin', robots: { index: false, follow: false } }

/** Every site setting (src/data/settingsDef.ts), grouped */
export default async function AdminSettings() {
  if (!(await isAdmin())) redirect('/admin')
  const { settings } = siteSettings()
  const groups = [...new Set(SETTINGS.map((s) => s.group))]
  return (
    <div className="page">
      <div className="clubs admin">
        <AdminNav current="/admin/indstillinger" />
        <h1 className="feed__title">Indstillinger</h1>
        {groups.map((group) => (
          <section key={group} className="panel prose__section">
            <h2 className="panel__title">{group}</h2>
            {SETTINGS.filter((s) => s.group === group).map((s) => (
              <div key={s.key} className="setting-row">
                <SettingToggle name={s.key} label={s.label} value={settings[s.key]} />
                <p className="muted small">{s.description}</p>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  )
}
