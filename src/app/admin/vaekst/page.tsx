import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AdminNav } from '../../../components/admin/AdminNav'
import { Bars } from '../../../components/admin/DashBars'
import { GrowthChecklist } from '../../../components/admin/GrowthChecklist'
import { isAdmin } from '../../../lib/admin'
import { GOAL_PER_DAY, growthTasks, searchConsole, siteViews } from '../../../lib/growth'
import { formatNumeric, formatTime } from '../../../lib/time'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Vækst · Admin', robots: { index: false, follow: false } }

const num = (n: number) => n.toLocaleString('da-DK')
/** "+35 %" or "–12 %" against the week before; nothing to compare with gives "" */
const change = (now: number, before: number) => (before > 0 ? `${now >= before ? '+' : '–'}${Math.abs(Math.round(((now - before) / before) * 100))} % mod ugen før` : '')

/**
 * /admin/vaekst: the way to 10,000 page views a day. The numbers (the site's own views and Google),
 * the week's task as a checklist written by Claude's Monday report, and the tasks before it.
 */
export default async function GrowthPage() {
  if (!(await isAdmin())) redirect('/admin')
  const views = siteViews()
  const gsc = searchConsole()
  const tasks = growthTasks()
  const [current, ...earlier] = tasks
  const perDay = views?.perDay ?? 0
  const google = views?.refs.find((r) => r.ref === 'Google')?.visitors ?? 0

  return (
    <div className="page">
      <div className="clubs admin dash">
        <AdminNav current="/admin/vaekst" />
        <div className="dash-head">
          <h1 className="feed__title">Vækst</h1>
          <p className="muted small">Vejen til {num(GOAL_PER_DAY)} sidevisninger om dagen · ugens opgave fra Claudes mandagsrapport · Google-tal fra Search Console</p>
        </div>

        <section className="panel dash-card growth-goal">
          <h2 className="panel__title">Målet</h2>
          <div className="growth-goal__row">
            <strong>{num(perDay)}</strong>
            <span>
              sidevisninger om dagen (snit sidste 7 dage) · mål {num(GOAL_PER_DAY)}
              {views && views.prev7 > 0 && <em> · {change(views.last7, views.prev7)}</em>}
            </span>
          </div>
          <div className="growth-goal__bar" aria-label={`${Math.round((perDay / GOAL_PER_DAY) * 1000) / 10} % af målet`}>
            <i style={{ width: `${Math.max(0.5, Math.min(100, (perDay / GOAL_PER_DAY) * 100))}%` }} />
          </div>
          {views && <Bars values={views.days.map((d) => d.views)} labels={views.days.map((d) => d.day)} unit="sidevisninger" />}
        </section>

        <div className="dash-tiles growth-tiles">
          <div className="dash-tile">
            <span className="dash-tile__label">Sidevisninger, 7 dage</span>
            <strong className="dash-tile__value">{num(views?.last7 ?? 0)}</strong>
            <span className="dash-tile__sub">{views ? change(views.last7, views.prev7) || 'første uge' : 'ingen tal'}</span>
          </div>
          <div className="dash-tile">
            <span className="dash-tile__label">Besøg fra Google, 30 dage</span>
            <strong className="dash-tile__value">{num(google)}</strong>
            <span className="dash-tile__sub">målt af siden selv</span>
          </div>
          <div className="dash-tile">
            <span className="dash-tile__label">Google-klik, 7 dage</span>
            <strong className="dash-tile__value">{num(gsc?.last7.clicks ?? 0)}</strong>
            <span className="dash-tile__sub">{gsc ? change(gsc.last7.clicks, gsc.prev7.clicks) || 'Search Console' : 'henter …'}</span>
          </div>
          <div className="dash-tile">
            <span className="dash-tile__label">Google-visninger, 7 dage</span>
            <strong className="dash-tile__value">{num(gsc?.last7.impressions ?? 0)}</strong>
            <span className="dash-tile__sub">{gsc ? change(gsc.last7.impressions, gsc.prev7.impressions) || 'Search Console' : 'henter …'}</span>
          </div>
          <div className="dash-tile">
            <span className="dash-tile__label">Gns. placering</span>
            <strong className="dash-tile__value">{gsc?.last7.position ? String(gsc.last7.position).replace('.', ',') : '–'}</strong>
            <span className="dash-tile__sub">lavere er bedre · side 1 = 1–10</span>
          </div>
        </div>

        <section className="panel dash-card growth-task">
          <h2 className="panel__title">Ugens opgave{current ? ` · uge ${current.week}` : ''}</h2>
          {current ? (
            <div className="growth-task__body">
              <h3>{current.title}</h3>
              <p>{current.why}</p>
              <GrowthChecklist task={current.id} steps={current.steps} done={current.done} />
              <dl className="growth-task__facts">
                <div>
                  <dt>Før</dt>
                  <dd>{current.before}</dd>
                </div>
                <div>
                  <dt>Mål</dt>
                  <dd>{current.goal}</dd>
                </div>
                {current.after2 && (
                  <div>
                    <dt>Efter 2 uger</dt>
                    <dd>{current.after2}</dd>
                  </div>
                )}
                {current.after4 && (
                  <div>
                    <dt>Efter 4 uger</dt>
                    <dd>{current.after4}</dd>
                  </div>
                )}
              </dl>
            </div>
          ) : (
            <p className="muted pad">Ingen opgave endnu – den kommer med Claudes rapport mandag morgen.</p>
          )}
        </section>

        {gsc && (gsc.almostPage1.length > 0 || gsc.noClicks.length > 0) && (
          <div className="dash-grid growth-grid">
            <section className="panel dash-card">
              <h2 className="panel__title">Tæt på side 1</h2>
              <p className="muted small pad">Søgninger, hvor vi ligger nr. 5–20 – en bedre titel eller mere tekst kan løfte dem.</p>
              <table className="growth-table">
                <thead>
                  <tr>
                    <th>Søgning → side</th>
                    <th>Visn.</th>
                    <th>Plads</th>
                  </tr>
                </thead>
                <tbody>
                  {gsc.almostPage1.map((r) => (
                    <tr key={r.key}>
                      <td>{r.key}</td>
                      <td>{num(r.impressions)}</td>
                      <td>{String(r.position).replace('.', ',')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            <section className="panel dash-card">
              <h2 className="panel__title">Mest søgt</h2>
              <table className="growth-table">
                <thead>
                  <tr>
                    <th>Søgning</th>
                    <th>Visn.</th>
                    <th>Klik</th>
                    <th>Plads</th>
                  </tr>
                </thead>
                <tbody>
                  {gsc.topQueries.slice(0, 10).map((r) => (
                    <tr key={r.key}>
                      <td>{r.key}</td>
                      <td>{num(r.impressions)}</td>
                      <td>{num(r.clicks)}</td>
                      <td>{String(r.position).replace('.', ',')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            <section className="panel dash-card">
              <h2 className="panel__title">Set, men ikke klikket</h2>
              <p className="muted small pad">Sider vist 10+ gange uden klik – titlen eller beskrivelsen frister ikke.</p>
              {gsc.noClicks.length ? (
                <table className="growth-table">
                  <thead>
                    <tr>
                      <th>Side</th>
                      <th>Visn.</th>
                      <th>Plads</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gsc.noClicks.map((r) => (
                      <tr key={r.key}>
                        <td>{r.key}</td>
                        <td>{num(r.impressions)}</td>
                        <td>{String(r.position).replace('.', ',')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="muted small pad">Ingen lige nu.</p>
              )}
            </section>
          </div>
        )}

        {earlier.length > 0 && (
          <section className="panel dash-card">
            <h2 className="panel__title">Tidligere opgaver</h2>
            <ul className="growth-history">
              {earlier.map((t) => (
                <li key={t.id}>
                  <span className={`growth-history__mark${t.complete ? ' is-done' : ''}`} aria-label={t.complete ? 'Udført' : 'Ikke udført'}>
                    {t.complete ? '✓' : '–'}
                  </span>
                  <span>
                    <b>
                      Uge {t.week}: {t.title}
                    </b>
                    <small>
                      Før: {t.before}
                      {t.after2 && ` · Efter 2 uger: ${t.after2}`}
                      {t.after4 && ` · Efter 4 uger: ${t.after4}`}
                    </small>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="muted small">
          {gsc ? `Google-tal hentet ${formatNumeric(new Date(gsc.fetchedAt))} kl. ${formatTime(new Date(gsc.fetchedAt))} (hentes igen efter 6 timer; Google er 1–2 dage bagud).` : 'Google-tallene hentes nu – genindlæs om et øjeblik.'}
          {gsc?.error && <span className="is-error"> Seneste hentning fejlede: {gsc.error}</span>}
        </p>
      </div>
    </div>
  )
}
