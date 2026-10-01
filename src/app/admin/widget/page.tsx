import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AdminNav } from '../../../components/admin/AdminNav'
import { Bars } from '../../../components/admin/DashBars'
import { isAdmin } from '../../../lib/admin'
import { widgetStats } from '../../../lib/widgetStats'
import { divisionBySlug } from '../../../data/leagues'
import { formatDayMonth } from '../../../lib/time'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Widget · Admin', robots: { index: false, follow: false } }

const num = (n: number) => n.toLocaleString('da-DK')
const when = (ts: number) => {
  const d = new Date(ts)
  return `${d.toLocaleDateString('da-DK', { day: 'numeric', month: 'short', timeZone: 'Europe/Copenhagen' })} ${d.toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Copenhagen' })}`
}
const leagueName = (slug: string) => divisionBySlug(slug)?.name ?? slug

/** Who uses the league table widget, and whether the link back to us is still there (src/lib/widgetStats.ts) */
export default async function WidgetAdminPage() {
  if (!(await isAdmin())) redirect('/admin')
  const s = widgetStats(30)
  return (
    <div className="page">
      <div className="clubs admin dash">
        <AdminNav current="/admin/widget" />
        <div className="dash-head">
          <h1 className="feed__title">Widget</h1>
          <p className="muted small">
            Sider med <Link href="/widget">ligatabellen</Link> · de sidste 30 dage · vores egne sider og robotter tælles ikke · en browser gemmer tabellen i 5 min., så tallene er et minimum
          </p>
        </div>
        {!s ? (
          <p className="unverified">Tallene kan ikke læses på denne server.</p>
        ) : (
          <>
            <div className="dash-tiles">
              <div className="dash-tile is-ok">
                <span className="dash-tile__label">Sider med tabellen</span>
                <strong className="dash-tile__value">{num(s.sites.length)}</strong>
                <span className="dash-tile__sub">{num(s.activeWeek)} vist de sidste 7 dage</span>
              </div>
              <div className="dash-tile is-ok">
                <span className="dash-tile__label">Visninger i dag</span>
                <strong className="dash-tile__value">{num(s.today)}</strong>
                <span className="dash-tile__sub">{num(s.week)} de sidste 7 dage</span>
              </div>
              <div className="dash-tile is-ok">
                <span className="dash-tile__label">Visninger, 30 dage</span>
                <strong className="dash-tile__value">{num(s.total)}</strong>
                <span className="dash-tile__sub">{s.leagues[0] ? `mest: ${leagueName(s.leagues[0].liga)}` : 'ingen endnu'}</span>
              </div>
              <div className={`dash-tile ${s.missingLink ? 'is-warn' : 'is-ok'}`}>
                <span className="dash-tile__label">Linket fjernet</span>
                <strong className="dash-tile__value">{num(s.missingLink)}</strong>
                <span className="dash-tile__sub">{s.missingLink ? 'sider uden link tilbage til os' : 'alle har linket'}</span>
              </div>
            </div>

            <div className="dash-grid">
              <section className="panel dash-card">
                <h2 className="panel__title">Visninger pr. dag</h2>
                <Bars values={s.days.map((d) => d.views)} labels={s.days.map((d) => formatDayMonth(d.day))} unit="visninger" />
                <p className="dash-axis muted small">
                  <span>{formatDayMonth(s.days[0].day)}</span>
                  <span>{formatDayMonth(s.days.at(-1)!.day)}</span>
                </p>
              </section>
              <section className="panel dash-card">
                <h2 className="panel__title">Ligaer</h2>
                <table className="dash-table">
                  <tbody>
                    {s.leagues.map((l) => (
                      <tr key={l.liga}>
                        <td>{leagueName(l.liga)}</td>
                        <td>{num(l.views)} visninger</td>
                      </tr>
                    ))}
                    {!s.leagues.length && (
                      <tr>
                        <td className="muted">Ingen endnu.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </section>
            </div>

            <section className="panel dash-card dash-wide">
              <h2 className="panel__title">Sider der bruger tabellen</h2>
              {s.sites.length ? (
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th>Side</th>
                      <th>Liga og hold</th>
                      <th>Visninger</th>
                      <th>Først set</th>
                      <th>Senest</th>
                      <th>Link til os</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.sites.map((x) => (
                      <tr key={x.domain}>
                        <td>
                          <a href={x.pages[0]?.page ?? `https://${x.domain}`} target="_blank" rel="noopener noreferrer nofollow">
                            <strong>{x.domain}</strong>
                          </a>
                          {x.pages.length > 1 && <div className="muted small">{x.pages.length} sider</div>}
                        </td>
                        <td className="small">
                          {x.leagues.map(leagueName).join(', ')}
                          {x.teams.length > 0 && <div className="muted">{x.teams.join(', ')}</div>}
                        </td>
                        <td>
                          {num(x.views)}
                          <div className="muted small">{num(x.week)} på 7 dage</div>
                        </td>
                        <td className="small">{when(x.firstSeen)}</td>
                        <td className="small">{when(x.lastSeen)}</td>
                        <td className={x.link === false ? 'is-bad' : undefined}>{x.link === true ? '✓ Ja' : x.link === false ? '✗ Fjernet' : 'Ukendt'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="muted small">Ingen sider bruger tabellen endnu. Del <Link href="/widget">matchly.dk/widget</Link> med klubber og fansider.</p>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
