import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { isAdmin } from '../../../lib/admin'
import { siteSettings } from '../../../lib/settings'
import { SETTINGS } from '../../../data/settingsDef'
import { SettingToggle } from '../../../components/admin/SettingToggle'
import { AdminNav } from '../../../components/admin/AdminNav'
import { NewsFeedsAdmin } from '../../../components/admin/NewsFeedsAdmin'
import Link from 'next/link'
import { newsCoverage, newsFeeds, newsStatus } from '../../../lib/news'
import { DIVISIONS } from '../../../data/leagues'
import { womenTeamOf } from '../../../data/teams'
import { SITE_URL, paths } from '../../../lib/site'
import { formatNumeric, formatTime } from '../../../lib/time'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Indstillinger · Admin', robots: { index: false, follow: false } }

/** Every site setting (src/data/settingsDef.ts), grouped */
export default async function AdminSettings() {
  if (!(await isAdmin())) redirect('/admin')
  const { settings } = siteSettings()
  const groups = [...new Set(SETTINGS.map((s) => s.group))]
  const status = newsStatus()
  const coverage = newsCoverage()
  const clubsWithNews = DIVISIONS.flatMap((d) => d.clubs)
    .filter((c) => coverage.clubs.has(c.id))
    .map((c) => ({ name: c.name, href: paths.club(c.slug), count: coverage.clubs.get(c.id)! }))
    .concat(
      [...coverage.women].map(([id, count]) => {
        const t = womenTeamOf(id)
        const club = DIVISIONS.flatMap((d) => d.clubs).find((c) => c.id === id)
        return { name: `${t?.name ?? club?.name ?? id} (kvinder)`, href: t ? paths.club(t.slug) : '', count }
      }),
    )
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'da'))
  const leaguesWithNews = DIVISIONS.filter((d) => coverage.leagues.has(d.id) || d.clubs.some((c) => coverage.clubs.has(c.id))).map((d) => ({
    name: d.name,
    href: paths.league(d.slug),
  }))
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
            {group === 'Søgemaskiner' && (
              <p className="muted small">
                Adressen søgemaskinerne får (SITE_URL): <strong>{SITE_URL}</strong>
                {!SITE_URL.startsWith('https://matchly.dk') && ' – bør være https://matchly.dk, ellers peger Google på en forkert adresse. Rettes i /opt/scoreline/env på serveren.'}
              </p>
            )}
          </section>
        ))}
        <section className="panel prose__section">
          <h2 className="panel__title">Nyheder</h2>
          <p className="muted small">
            Overskrifter fra RSS-feeds vises som &quot;Seneste nyheder&quot; på klub- og ligasider, når overskriften eller underrubrikken nævner klubben
            eller ligaen. Klik åbner artiklen hos kilden. Feeds hentes hvert 15. minut.
          </p>
          <NewsFeedsAdmin feeds={feeds} />
          <div className="news-coverage">
            <h3>
              Koblet til klubber og ligaer <span className="muted small">({coverage.total} artikler i alt)</span>
            </h3>
            {clubsWithNews.length === 0 ? (
              <p className="muted small">Ingen artikler nævner vores klubber endnu.</p>
            ) : (
              <>
                <p className="muted small">Ligasider med nyheder: {leaguesWithNews.map((l, i) => (
                  <span key={l.href}>
                    {i > 0 && ', '}
                    <Link href={l.href}>{l.name}</Link>
                  </span>
                ))}</p>
                <ul className="news-coverage__list">
                  {clubsWithNews.map((c) => (
                    <li key={c.name}>
                      {c.href ? <Link href={c.href}>{c.name}</Link> : <span title="Kvindeholdet har ingen side hos os">{c.name}</span>}{' '}
                      <span className="muted small">{c.count}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
