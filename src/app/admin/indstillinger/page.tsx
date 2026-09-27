import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { isAdmin } from '../../../lib/admin'
import { siteSettings } from '../../../lib/settings'
import { SETTINGS } from '../../../data/settingsDef'
import { SettingToggle } from '../../../components/admin/SettingToggle'
import { AdminNav } from '../../../components/admin/AdminNav'
import { NewsFeedsAdmin } from '../../../components/admin/NewsFeedsAdmin'
import { newsFeeds, newsStatus } from '../../../lib/news'
import { formatNumeric, formatTime } from '../../../lib/time'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Indstillinger · Admin', robots: { index: false, follow: false } }

/** Every site setting (src/data/settingsDef.ts), grouped */
export default async function AdminSettings() {
  if (!(await isAdmin())) redirect('/admin')
  const { settings } = siteSettings()
  const groups = [...new Set(SETTINGS.map((s) => s.group))]
  const status = newsStatus()
  const feeds = newsFeeds().map((f) => {
    const st = status[f.id] ?? {}
    return { ...f, items: st.items, error: st.error, fetchedAt: st.fetchedAt ? `${formatNumeric(new Date(st.fetchedAt))} ${formatTime(new Date(st.fetchedAt))}` : undefined }
  })
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
        <section className="panel prose__section">
          <h2 className="panel__title">Nyheder</h2>
          <p className="muted small">
            Overskrifter fra RSS-feeds vises som &quot;Seneste nyheder&quot; på klub- og ligasider, når overskriften eller underrubrikken nævner klubben
            eller ligaen. Klik åbner artiklen hos kilden. Feeds hentes hvert 15. minut.
          </p>
          <NewsFeedsAdmin feeds={feeds} />
        </section>
      </div>
    </div>
  )
}
