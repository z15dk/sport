import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AdminNav } from '../../../components/admin/AdminNav'
import { AdEmbedBuilder } from '../../../components/admin/AdEmbedBuilder'
import { Bars } from '../../../components/admin/DashBars'
import { isAdmin } from '../../../lib/admin'
import { adStats, ctr } from '../../../lib/adStats'
import { SITE_URL } from '../../../lib/site'
import { formatDayMonth } from '../../../lib/time'
import '../../widget/widget.css'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Matchly-annoncen · Admin', robots: { index: false, follow: false } }

const num = (n: number) => n.toLocaleString('da-DK')
const pct = (views: number, clicks: number) => {
  const c = ctr(views, clicks)
  return c === undefined ? '–' : `${c.toLocaleString('da-DK')} %`
}
const when = (ts: number) => {
  const d = new Date(ts)
  return `${d.toLocaleDateString('da-DK', { day: 'numeric', month: 'short', timeZone: 'Europe/Copenhagen' })} ${d.toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Copenhagen' })}`
}
const campaignName = (c: string) => c || '(uden navn)'

/** Matchly's own full-page ad for other sites: the code per recipient, a preview, and views and clicks (src/lib/adStats.ts) */
export default async function AdAdminPage() {
  if (!(await isAdmin())) redirect('/admin')
  const s = adStats(30)
  return (
    <div className="page">
      <div className="clubs admin dash">
        <AdminNav current="/admin/annonce" />
        <div className="dash-head">
          <h1 className="feed__title">Matchly-annoncen</h1>
          <p className="muted small">
            En levende helsidesannonce for Matchly, som andre sider sætter ind med én kodestump: kampene lige nu, hvad vi tilbyder og rigtige tal. Hvert klik tælles pr. side og
            kampagne.
          </p>
        </div>
        <AdEmbedBuilder site={SITE_URL} />
        {!s ? (
          <p className="unverified">Tallene kan ikke læses på denne server.</p>
        ) : (
          <>
            <div className="dash-tiles">
              <div className="dash-tile is-ok">
                <span className="dash-tile__label">Visninger i dag</span>
                <strong className="dash-tile__value">{num(s.today.views)}</strong>
                <span className="dash-tile__sub">{num(s.week.views)} de sidste 7 dage</span>
              </div>
              <div className="dash-tile is-ok">
                <span className="dash-tile__label">Klik i dag</span>
                <strong className="dash-tile__value">{num(s.today.clicks)}</strong>
                <span className="dash-tile__sub">{num(s.week.clicks)} de sidste 7 dage</span>
              </div>
              <div className="dash-tile is-ok">
                <span className="dash-tile__label">Klikrate, 7 dage</span>
                <strong className="dash-tile__value">{pct(s.week.views, s.week.clicks)}</strong>
                <span className="dash-tile__sub">klik pr. visning</span>
              </div>
              <div className="dash-tile is-ok">
                <span className="dash-tile__label">30 dage</span>
                <strong className="dash-tile__value">{num(s.total.clicks)}</strong>
                <span className="dash-tile__sub">klik af {num(s.total.views)} visninger</span>
              </div>
              <div className="dash-tile is-ok">
                <span className="dash-tile__label">Sider med annoncen</span>
                <strong className="dash-tile__value">{num(s.sites.length)}</strong>
                <span className="dash-tile__sub">{num(s.activeWeek)} vist de sidste 7 dage</span>
              </div>
              <div className="dash-tile is-ok">
                <span className="dash-tile__label">Kampagner</span>
                <strong className="dash-tile__value">{num(s.campaigns.length)}</strong>
                <span className="dash-tile__sub">{s.campaigns[0] ? `flest klik: ${campaignName(s.campaigns.slice().sort((a, b) => b.clicks - a.clicks)[0].campaign)}` : 'ingen endnu'}</span>
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
                <h2 className="panel__title">Klik pr. dag</h2>
                <Bars values={s.days.map((d) => d.clicks)} labels={s.days.map((d) => formatDayMonth(d.day))} unit="klik" />
                <p className="dash-axis muted small">
                  <span>{formatDayMonth(s.days[0].day)}</span>
                  <span>{formatDayMonth(s.days.at(-1)!.day)}</span>
                </p>
              </section>
            </div>

            <div className="dash-grid">
              <section className="panel dash-card">
                <h2 className="panel__title">Kampagner</h2>
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th>Kampagne</th>
                      <th>Visninger</th>
                      <th>Klik</th>
                      <th>Rate</th>
                      <th>Senest</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.campaigns.map((c) => (
                      <tr key={c.campaign}>
                        <td>
                          <strong>{campaignName(c.campaign)}</strong>
                          {c.sites.length > 0 && <div className="muted small">{c.sites.join(', ')}</div>}
                        </td>
                        <td>{num(c.views)}</td>
                        <td>{num(c.clicks)}</td>
                        <td>{pct(c.views, c.clicks)}</td>
                        <td className="small">{when(c.lastSeen)}</td>
                      </tr>
                    ))}
                    {!s.campaigns.length && (
                      <tr>
                        <td className="muted" colSpan={5}>
                          Ingen endnu. Send koden ovenfor til en modtager.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </section>
              <section className="panel dash-card">
                <h2 className="panel__title">Hvad der klikkes på</h2>
                <table className="dash-table">
                  <tbody>
                    {s.targets.map((t) => (
                      <tr key={t.target}>
                        <td>
                          <a href={t.target} target="_blank" rel="noopener">
                            {t.target === '/' ? 'Forsiden' : t.target}
                          </a>
                        </td>
                        <td>{num(t.clicks)} klik</td>
                      </tr>
                    ))}
                    {!s.targets.length && (
                      <tr>
                        <td className="muted">Ingen klik endnu.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </section>
            </div>

            <section className="panel dash-card dash-wide">
              <h2 className="panel__title">Sider der viser annoncen</h2>
              {s.sites.length ? (
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th>Side</th>
                      <th>Kampagne</th>
                      <th>Visninger</th>
                      <th>Klik</th>
                      <th>Rate</th>
                      <th>Først set</th>
                      <th>Senest</th>
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
                        <td className="small">{x.campaigns.map(campaignName).join(', ')}</td>
                        <td>
                          {num(x.views)}
                          <div className="muted small">{num(x.week)} på 7 dage</div>
                        </td>
                        <td>
                          {num(x.clicks)}
                          <div className="muted small">{num(x.weekClicks)} på 7 dage</div>
                        </td>
                        <td>{pct(x.views, x.clicks)}</td>
                        <td className="small">{when(x.firstSeen)}</td>
                        <td className="small">{when(x.lastSeen)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="muted small">Ingen sider viser annoncen endnu. Vores egne sider, forhåndsvisningen og robotter tælles ikke.</p>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
