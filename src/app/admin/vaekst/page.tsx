import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AdminNav } from '../../../components/admin/AdminNav'
import { GrowthChecklist } from '../../../components/admin/GrowthChecklist'
import { IndexNowForm } from '../../../components/admin/IndexNowButton'
import { indexNowLog } from '../../../lib/indexnow'
import { isAdmin } from '../../../lib/admin'
import { GOAL_PER_DAY, growthTasks, searchConsole, siteViews } from '../../../lib/growth'
import { readDiary } from '../../../lib/jamesGrowth'
import { readSeoOverrides } from '../../../lib/seoOverrides'
import { formatNumeric, formatTime } from '../../../lib/time'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Vækst · Admin', robots: { index: false, follow: false } }

const num = (n: number) => n.toLocaleString('da-DK')
/** Milestones on the way to 10,000 a day, so the progress is something you can see */
const MILESTONES = [100, 250, 500, 1000, 2500, 5000, 10000]
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
  // This week's tasks and any earlier ones not done yet are the checklists; the rest is history
  const week = tasks[0]?.week
  const open = tasks.filter((t) => t.week === week || !t.complete).sort((a, b) => Number(a.complete) - Number(b.complete) || a.createdAt.localeCompare(b.createdAt))
  const earlier = tasks.filter((t) => !open.includes(t))
  const left = open.reduce((n, t) => n + t.steps.filter((s) => !t.done[s.id] && s.by !== 'claude').length, 0)
  const byClaude = open.reduce((n, t) => n + t.steps.filter((s) => s.by === 'claude' && t.done[s.id]).length, 0)
  const perDay = views?.perDay ?? 0
  const google = views?.refs.find((r) => r.ref === 'Google')?.visitors ?? 0
  // The milestones on the way to the goal, and the next one not reached
  const next = MILESTONES.find((m) => m > perDay) ?? GOAL_PER_DAY
  // The days since the count began (the first day with views), today last
  const firstDay = views?.days.findIndex((d) => d.views > 0) ?? -1
  const counted = firstDay >= 0 ? views!.days.slice(firstDay) : []
  const maxDay = Math.max(1, ...counted.map((d) => d.views))

  return (
    <div className="page">
      <div className="clubs admin dash">
        <AdminNav current="/admin/vaekst" />
        {/* The top: the number, the next milestone on the way and the days counted so far */}
        <header className="gh">
          <span className="gh__m" aria-hidden="true">
            M
          </span>
          <p className="gh__kicker">
            <span className="gh__logo">
              MATCHLY<b>.</b>
            </span>
            <span>Vækst</span>
            <span>Mål {num(GOAL_PER_DAY)} sidevisninger om dagen</span>
          </p>
          <div className="gh__main">
            <div className="gh__now">
              <strong>{num(perDay)}</strong>
              <span>
                sidevisninger om dagen
                <small>snit sidste 7 dage{views && views.prev7 > 0 ? ` · ${change(views.last7, views.prev7)}` : ''}</small>
              </span>
            </div>
            <div className="gh__next">
              <span className="gh__label">Næste delmål</span>
              <b>{num(next)} om dagen</b>
              <div className="gh__bar" aria-label={`${Math.round((perDay / next) * 100)} % af delmålet`}>
                <i style={{ width: `${Math.max(2, Math.min(100, (perDay / next) * 100))}%` }} />
              </div>
              <small>{perDay >= next ? 'Nået!' : `${num(next - perDay)} mangler · ${Math.round((perDay / next) * 100)} % af vejen`}</small>
            </div>
          </div>
          <ol className="gh__steps" aria-label="Delmål på vejen">
            {MILESTONES.map((m) => (
              <li key={m} className={perDay >= m ? 'is-done' : m === next ? 'is-next' : undefined}>
                <span>{m >= 1000 ? `${m / 1000}k` : m}</span>
              </li>
            ))}
          </ol>
          {counted.length > 0 && (
            <div className="gh__days">
              <span className="gh__label">Sidevisninger pr. dag, siden tællingen startede</span>
              <div className="gh__chart">
                {counted.map((d) => (
                  <span key={d.day} title={`${d.day}: ${num(d.views)} sidevisninger`}>
                    <i style={{ height: `${Math.max(3, (d.views / maxDay) * 100)}%` }} />
                    <em>{Number(d.day.slice(8))}/{Number(d.day.slice(5, 7))}</em>
                  </span>
                ))}
              </div>
            </div>
          )}
        </header>

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

        {(() => {
          // James' daily growth round (src/lib/jamesGrowth.ts): his diary and the titles he is testing
          const diary = readDiary().slice(-7).reverse()
          const seo = readSeoOverrides()
          const tests = Object.entries(seo.pages).sort((x, y) => y[1].at - x[1].at)
          const pct = (n?: number) => (n === undefined ? '–' : `${String(n).replace('.', ',')} %`)
          const pos = (n?: number) => (n === undefined ? '–' : String(n).replace('.', ','))
          return (
            <div className="jd">
              <section className="panel dash-card jd-diary">
                <h2 className="panel__title">James' dagbog</h2>
                {diary.length ? (
                  <ol className="jd-list">
                    {diary.map((e) => (
                      <li key={e.day}>
                        <span className="jd-day">{formatNumeric(new Date(e.at))}</span>
                        <p>{e.text}</p>
                        {e.actions.length > 0 && (
                          <ul className="jd-actions">
                            {e.actions.map((a) => (
                              <li key={a}>{a}</li>
                            ))}
                          </ul>
                        )}
                        {e.ideas && e.ideas.length > 0 && <p className="jd-ideas">💡 Idéer til nyhedsspejderen: {e.ideas.join(' · ')}</p>}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="muted">James skriver her hver morgen kl. 06.30: hvad tallene siger, og hvad han har gjort ved det.</p>
                )}
              </section>
              <section className="panel dash-card jd-tests">
                <h2 className="panel__title">Titler James tester ({tests.length})</h2>
                {tests.length ? (
                  <ul className="jd-test-list">
                    {tests.map(([path, o]) => {
                      const age = Math.floor((Date.now() - o.at) / 86_400_000)
                      return (
                        <li key={path}>
                          <a href={path}>{path}</a>
                          {o.title && <strong>{o.title}</strong>}
                          {o.faq?.length ? <span className="small">Spørgsmål: {o.faq.map((f) => f.q).join(' · ')}</span> : null}
                          <span className="muted small">
                            {o.query && `“${o.query}” · `}før: plads {pos(o.before?.position)}, klikrate {pct(o.before?.ctr)} · {o.kept ? 'beholdt' : age >= 14 ? 'klar til dom' : `${age} af 14 dage`}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <p className="muted">Ingen endnu. James sætter op til 5 nye titler om dagen på sider tæt på side 1 og dømmer dem efter 14 dage.</p>
                )}
              </section>
            </div>
          )
        })()}

        <section className="panel dash-card growth-task">
          <h2 className="panel__title">Ugens opgaver{week ? ` · uge ${week}` : ''}</h2>
          {open.length > 0 && (
            <p className="growth-task__sum">
              <b>{left}</b> {left === 1 ? 'trin' : 'trin'} til dig · <b>{byClaude}</b> løst af James · {open.filter((t) => t.complete).length} af {open.length} opgaver klaret
            </p>
          )}
          {open.length ? (
            open.map((t) => (
              <div key={t.id} className={`growth-task__body${t.complete ? ' is-complete' : ''}`}>
                <h3>
                  {t.complete && <span className="growth-task__ok">✓</span>}
                  {t.title}
                  {t.week !== week && <span className="growth-task__carry">fra uge {t.week}</span>}
                </h3>
                <p>{t.why}</p>
                <GrowthChecklist task={t.id} steps={t.steps} done={t.done} />
                <dl className="growth-task__facts">
                  <div>
                    <dt>Før</dt>
                    <dd>{t.before}</dd>
                  </div>
                  <div>
                    <dt>Mål</dt>
                    <dd>{t.goal}</dd>
                  </div>
                  {t.after2 && (
                    <div>
                      <dt>Efter 2 uger</dt>
                      <dd>{t.after2}</dd>
                    </div>
                  )}
                  {t.after4 && (
                    <div>
                      <dt>Efter 4 uger</dt>
                      <dd>{t.after4}</dd>
                    </div>
                  )}
                </dl>
              </div>
            ))
          ) : (
            <p className="muted pad">Ingen opgaver endnu – de kommer med James' rapport mandag morgen.</p>
          )}
        </section>

        {/* Without Google's numbers yet the three boxes still stand, saying they are on their way */}
        {!gsc && (
          <div className="dash-grid growth-grid">
            {['Tæt på side 1', 'Mest søgt', 'Set, men ikke klikket'].map((t) => (
              <section key={t} className="panel dash-card">
                <h2 className="panel__title">{t}</h2>
                <p className="muted small pad">Google-tallene hentes – genindlæs siden om et øjeblik.</p>
              </section>
            ))}
          </div>
        )}
        {gsc && (
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

        <section className="panel dash-card growth-indexnow">
          <h2 className="panel__title">⚡ Index Now</h2>
          <p className="muted small pad">
            Fortæl Bing, Yandex m.fl. om nye eller ændrede sider med det samme – én adresse pr. linje (højst 100). Google er ikke med i IndexNow; der
            bruges &quot;Anmod om indeksering&quot; i Search Console. Knappen findes også i admin-bjælken på hver side og i artikeleditoren.
          </p>
          <div className="pad">
            <IndexNowForm />
          </div>
          {indexNowLog().length > 0 && (
            <ul className="growth-history pad">
              {indexNowLog()
                .slice(0, 6)
                .map((l) => (
                  <li key={l.at}>
                    <span className={`growth-history__mark${l.status === 200 || l.status === 202 ? ' is-done' : ''}`}>{l.status === 200 || l.status === 202 ? '✓' : '!'}</span>
                    <span>
                      <b>
                        {formatNumeric(new Date(l.at))} kl. {formatTime(new Date(l.at))} · {l.count} {l.count === 1 ? 'side' : 'sider'} · svar {l.status ?? 'ingen'}
                      </b>
                      <small>{l.paths.slice(0, 4).join(' · ')}{l.paths.length > 4 ? ' …' : ''}</small>
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </section>

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
