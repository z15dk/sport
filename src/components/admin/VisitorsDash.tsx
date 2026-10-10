import Link from 'next/link'
import { Bars } from './DashBars'
import { DashFlow } from './DashFlow'
import { liveVisitors, visitStats } from '../../lib/visits'
import { formatDayMonth } from '../../lib/time'

// Our own visitor statistics without cookies (src/lib/visits.ts): the top of the
// admin's general dashboard (/admin/indstillinger)

const PERIODS = [
  { key: '1', label: 'I dag', days: 1 },
  { key: '7', label: '7 dage', days: 7 },
  { key: '30', label: '30 dage', days: 30 },
]
const num = (n: number) => n.toLocaleString('da-DK')
const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)} %` : '–')
const change = (now: number, before: number) => (before ? `${now >= before ? '+' : ''}${Math.round(((now - before) / before) * 100)} % mod i går` : 'ingen tal for i går')

/**
 * Tiles and cards with the visitors; `href` is the page the period links go to. `children` (the page's
 * own cards) join the same flow, so every card fills the shortest column and the dashboard has no holes; `lead` comes first
 */
export function VisitorsDash({ periode, href, children, lead }: { periode?: string; href: string; children?: React.ReactNode; lead?: React.ReactNode }) {
  const period = PERIODS.find((p) => p.key === periode) ?? PERIODS[0]
  const s = visitStats(period.days)
  if (!s)
    return (
      <>
        <p className="unverified">Statistikken kan ikke læses på denne server.</p>
        <DashFlow>
          {lead}
          {children}
        </DashFlow>
      </>
    )
  const hourLabel = (h: number) => `kl. ${String(h).padStart(2, '0')}`
  const devicesTotal = s.devices.reduce((n, d) => n + d.visitors, 0)
  const refsTotal = s.refs.reduce((n, r) => n + r.visitors, 0)
  return (
    <>
      <div className="dash-tiles">
        <div className="dash-tile is-ok">
          <span className="dash-tile__label">Lige nu</span>
          <strong className="dash-tile__value">{num(s.now)}</strong>
          <span className="dash-tile__sub">besøgende de sidste 5 min.</span>
        </div>
        <div className="dash-tile is-ok">
          <span className="dash-tile__label">Besøgende i dag</span>
          <strong className="dash-tile__value">{num(s.today.visitors)}</strong>
          <span className="dash-tile__sub">{change(s.today.visitors, s.yesterday.visitors)}</span>
        </div>
        <div className="dash-tile is-ok">
          <span className="dash-tile__label">Sidevisninger i dag</span>
          <strong className="dash-tile__value">{num(s.today.views)}</strong>
          <span className="dash-tile__sub">{s.today.visitors ? `${(s.today.views / s.today.visitors).toLocaleString('da-DK', { maximumFractionDigits: 1 })} pr. besøgende` : '–'}</span>
        </div>
        <div className="dash-tile is-ok">
          <span className="dash-tile__label">I går</span>
          <strong className="dash-tile__value">{num(s.yesterday.visitors)}</strong>
          <span className="dash-tile__sub">{num(s.yesterday.views)} sidevisninger</span>
        </div>
        <div className="dash-tile is-ok">
          <span className="dash-tile__label">Sidste 7 dage</span>
          <strong className="dash-tile__value">{num(s.week.visitors)}</strong>
          <span className="dash-tile__sub">{num(s.week.views)} sidevisninger</span>
        </div>
        <div className="dash-tile is-ok">
          <span className="dash-tile__label">Mål</span>
          <strong className="dash-tile__value">{pct(s.today.visitors, 10_000)}</strong>
          <span className="dash-tile__sub">af 10.000 besøgende om dagen</span>
        </div>
      </div>

      <DashFlow>
        {lead}
        {(() => {
          // Who is on which page right now (the last 5 minutes), as behind "N nu" in the admin bar
          const live = liveVisitors(5)
          return (
            <section className="panel dash-card">
              <h2 className="panel__title">Lige nu ({live.visitors.length})</h2>
              {!live.visitors.length ? (
                <p className="muted small">Ingen besøgende de sidste 5 minutter.</p>
              ) : (
                <table className="dash-table dash-pages">
                  <thead>
                    <tr>
                      <th>Side</th>
                      <th>Hvornår</th>
                      <th>Fra</th>
                    </tr>
                  </thead>
                  <tbody>
                    {live.visitors.slice(0, 15).map((v, i) => (
                      <tr key={i}>
                        <td>
                          <a href={v.path} target="_blank" rel="noreferrer">
                            {v.path === '/' ? 'Forsiden' : decodeURIComponent(v.path)}
                          </a>
                          <span className="muted"> · {v.device === 'mobil' ? 'mobil' : v.device === 'tablet' ? 'tablet' : 'computer'}{v.views > 1 ? ` · ${v.views} sider` : ''}</span>
                        </td>
                        <td>{v.minutes < 1 ? 'lige nu' : `${v.minutes} min.`}</td>
                        <td>{v.ref || '–'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          )
        })()}
        <section className="panel dash-card">
          <h2 className="panel__title">Besøgende pr. dag</h2>
          <Bars values={s.days.map((d) => d.visitors)} labels={s.days.map((d) => formatDayMonth(d.day))} unit="besøgende" />
          <p className="dash-axis muted small">
            <span>{formatDayMonth(s.days[0].day)}</span>
            <span>30 dage</span>
            <span>i dag</span>
          </p>
          <h3 className="dash-sub">I dag pr. time (nye besøgende)</h3>
          <Bars values={s.hours} labels={s.hours.map((_, h) => hourLabel(h))} unit="nye besøgende" />
          <p className="dash-axis muted small">
            <span>kl. 00</span>
            <span>kl. 12</span>
            <span>kl. 23</span>
          </p>
        </section>

        <section className="panel dash-card">
          <h2 className="panel__title">Mest sete sider</h2>
          <p className="filter-bar dash-periods">
            {PERIODS.map((p) => (
              <Link key={p.key} className={`pill${p === period ? ' is-active' : ''}`} href={`${href}?periode=${p.key}`}>
                {p.label}
              </Link>
            ))}
          </p>
          <table className="dash-table dash-pages">
            <thead>
              <tr>
                <th>Side</th>
                <th>Visninger</th>
                <th>Besøgende</th>
              </tr>
            </thead>
            <tbody>
              {s.pages.map((p) => (
                <tr key={p.path}>
                  <td>
                    <a href={p.path} target="_blank" rel="noreferrer">
                      {p.path === '/' ? 'Forsiden' : p.path}
                    </a>
                  </td>
                  <td>{num(p.views)}</td>
                  <td>{num(p.visitors)}</td>
                </tr>
              ))}
              {!s.pages.length && (
                <tr>
                  <td colSpan={3} className="muted">
                    Ingen besøg endnu.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

          <section className="panel dash-card">
          <h2 className="panel__title">Hvor de kommer fra</h2>
          <table className="dash-table dash-pages">
            <tbody>
              {s.refs.map((r) => (
                <tr key={r.ref}>
                  <td>{r.ref}</td>
                  <td>{num(r.visitors)}</td>
                  <td className="muted">{pct(r.visitors, refsTotal)}</td>
                </tr>
              ))}
              {!s.refs.length && (
                <tr>
                  <td className="muted">Ingen endnu.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
        <section className="panel dash-card">
          <h2 className="panel__title">Enheder</h2>
          <table className="dash-table">
            <tbody>
              {s.devices.map((d) => (
                <tr key={d.device}>
                  <td>{d.device === 'mobil' ? 'Mobil' : d.device === 'tablet' ? 'Tablet' : 'Computer'}</td>
                  <td>{num(d.visitors)}</td>
                  <td className="muted">{pct(d.visitors, devicesTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">Perioden: {period.label.toLowerCase()}.</p>
        </section>
        {children}
      </DashFlow>
    </>
  )
}
