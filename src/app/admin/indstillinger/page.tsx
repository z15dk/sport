import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { isAdmin } from '../../../lib/admin'
import { indexable, siteSettings } from '../../../lib/settings'
import { SETTINGS } from '../../../data/settingsDef'
import { SettingToggle } from '../../../components/admin/SettingToggle'
import { AdminNav } from '../../../components/admin/AdminNav'
import { VisitorsDash } from '../../../components/admin/VisitorsDash'
import { JamesStatus } from '../../../components/admin/JamesStatus'
import { NewsFeedsAdmin } from '../../../components/admin/NewsFeedsAdmin'
import { TrackingAdmin } from '../../../components/admin/TrackingAdmin'
import { trackingConfig } from '../../../lib/tracking'
import { indexNowStatus } from '../../../lib/indexnow'
import { consentStats } from '../../../lib/consentLog'
import Link from 'next/link'
import { newsCoverage, newsFeeds, newsStatus } from '../../../lib/news'
import { DIVISIONS } from '../../../data/leagues'
import { womenTeamOf } from '../../../data/teams'
import { SITE_URL, paths } from '../../../lib/site'
import { formatNumeric, formatTime } from '../../../lib/time'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Generelt · Admin', robots: { index: false, follow: false } }

/** The general dashboard: the visitors on top, then the site settings (src/data/settingsDef.ts), tracking and news as cards */
export default async function AdminSettings({ searchParams }: { searchParams: Promise<{ samtykke?: string; periode?: string }> }) {
  if (!(await isAdmin())) redirect('/admin')
  const params = await searchParams
  const lookup = params.samtykke?.trim().toLowerCase()
  const consents = consentStats(lookup)
  const tracking = trackingConfig()
  const indexNow = indexNowStatus()
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
      <div className="clubs admin dash">
        <AdminNav current="/admin/indstillinger" />
        <div className="dash-head">
          <h1 className="feed__title">Generelt</h1>
          <p className="muted small">Besøgende uden cookies · søgemaskiner og dine egne besøg tælles ikke med · en besøgende genkendes kun inden for samme døgn</p>
        </div>
        <VisitorsDash periode={params.periode} href="/admin/indstillinger" lead={<JamesStatus />}>
          <section className="panel dash-card">
            <h2 className="panel__title">Funktioner på siden</h2>
            {groups.map((group) => (
              <div key={group} className="dash-setting">
                <h3 className="dash-sub">{group}</h3>
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
                {group === 'Søgemaskiner' && indexable() && (
                  <p className={`small${indexNow && indexNow.status !== 200 && indexNow.status !== 202 ? ' is-error' : ' muted'}`}>
                    Besked til Bing (IndexNow):{' '}
                    {indexNow
                      ? `senest ${formatNumeric(new Date(indexNow.at))} kl. ${formatTime(new Date(indexNow.at))} – ${indexNow.count} ${indexNow.count === 1 ? 'adresse' : 'adresser'}, svar ${indexNow.status}${
                          indexNow.status === 200 || indexNow.status === 202 ? ' (modtaget)' : ' (afvist – tjek at /indexnow.txt kan åbnes)'
                        }`
                      : 'intet sendt endnu – den første besked går af sted kort efter en genstart.'}
                  </p>
                )}
              </div>
            ))}
          </section>
          <section className="panel dash-card">
            <h2 className="panel__title">Sporing og cookies</h2>
            <p className="muted small">
              Google Analytics og Meta Pixel indlæses først, når den besøgende har sagt ja i cookie-banneret (Statistik → Google Analytics, Marketing → Meta
              Pixel). Banneret vises kun, når mindst ét id er udfyldt, og aldrig for dig, når du er logget ind (du tælles heller ikke). Tomt felt = slået fra.
              Id&apos;erne findes i Google Analytics under Administrator → Datastrømme og i Meta Events Manager under Datakilder. Bing: på
              bing.com/webmasters kan siden hentes direkte fra Google Search Console (så skal feltet ikke bruges) – ellers vælg &quot;HTML Meta Tag&quot; og
              indsæt koden her.
            </p>
            <TrackingAdmin {...tracking} />
            {(tracking.ga || tracking.metaPixel) && !tracking.owner?.email && (
              <p className="is-error small">Udfyld dataansvarlig og kontakt-mail – det skal stå på /privatliv (GDPR art. 13).</p>
            )}
            <h3>Samtykker (bevis, GDPR art. 7)</h3>
            <p className="muted small">
              Hvert valg i banneret gemmes med browserens tilfældige samtykke-id, tidspunkt, bannerets version og valget – uden IP-adresse – i 3 år. Den
              besøgende kan se sit id under Cookie-indstillinger → Tilpas.
            </p>
            {consents ? (
              <>
                <p className="small">
                  Sidste 30 dage: <strong>{consents.total}</strong> valg · accepter alle {consents.by.accept ?? 0} · kun nødvendige {consents.by.reject ?? 0} · tilpasset{' '}
                  {consents.by.custom ?? 0} · trukket tilbage {consents.by.withdraw ?? 0}
                  {consents.total > 0 && ` · ${Math.round(((consents.by.accept ?? 0) / consents.total) * 100)} % siger ja til alt`}
                </p>
                <form className="tracking-form" method="get">
                  <label>
                    Slå et samtykke-id op
                    <input name="samtykke" defaultValue={lookup} placeholder="fx k3j9…" />
                  </label>
                  <button type="submit" className="pill">
                    Søg
                  </button>
                </form>
                {consents.found &&
                  (consents.found.length ? (
                    <ul className="admin-list small">
                      {consents.found.map((c, i) => (
                        <li key={i}>
                          {formatNumeric(new Date(c.at))} {formatTime(new Date(c.at))} · {{ accept: 'Accepter alle', reject: 'Kun nødvendige', custom: 'Tilpasset', withdraw: 'Trukket tilbage' }[c.action]} · statistik{' '}
                          {c.stats ? 'ja' : 'nej'} · marketing {c.marketing ? 'ja' : 'nej'} · banner v{c.version}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted small">Ingen samtykker med det id.</p>
                  ))}
              </>
            ) : (
              <p className="muted small">Samtykkeloggen kunne ikke åbnes.</p>
            )}
          </section>
          <section className="panel dash-card">
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
        </VisitorsDash>
      </div>
    </div>
  )
}
