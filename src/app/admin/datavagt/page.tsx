import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AdminNav } from '../../../components/admin/AdminNav'
import { DatavagtButton } from '../../../components/admin/DatavagtButton'
import { ResetMatchButton, StuckMatchActions } from '../../../components/admin/StuckMatchActions'
import { SOURCE_GAME, matchOverrides } from '../../../lib/matchOverrides'
import { DatavagtRunButton } from '../../../components/admin/DatavagtRunButton'
import { isAdmin } from '../../../lib/admin'
import { getBadges } from '../../../lib/badges'
import { readDatavagt, type Finding } from '../../../lib/datavagt'
import { readRettelser } from '../../../lib/rettelser'
import { formatFull, formatTime } from '../../../lib/time'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Datavagt', robots: { index: false, follow: false } }

// The datavagt as a dashboard: the numbers on top (open findings by kind, what was fixed this week), the open
// findings grouped by kind with the club's logo and what each source says side by side, and to the right what
// Claude and the owner have fixed, the coaches we correct and what has been confirmed. Claude reads and fixes
// the list each morning through /api/admin/datavagt.

const when = (ms: number) => `${formatFull(new Date(ms))} kl. ${formatTime(new Date(ms))}`
const short = (ms: number) => {
  const d = new Date(ms)
  return `${d.toLocaleDateString('da-DK', { day: 'numeric', month: 'short', timeZone: 'Europe/Copenhagen' })} ${formatTime(d)}`
}

type Group = 'coach' | 'ground' | 'tv' | 'table' | 'stuck'
const GROUPS: { key: Group; title: string; hint: string }[] = [
  { key: 'coach', title: 'Trænere', hint: 'James tjekker dem hver morgen og retter selv' },
  { key: 'ground', title: 'Stadion', hint: 'Hjemmebanen på klubsiderne' },
  { key: 'table', title: 'Tabel', hint: 'Vores stilling mod API-Sports' },
  { key: 'tv', title: 'TV-kanal', hint: 'Ugens kampe uden kanal i TV-guiden' },
  { key: 'stuck', title: 'Kampe der hænger', hint: 'Står som i gang eller ikke spillet' },
]
const groupOf = (f: Finding): Group =>
  f.kind.startsWith('coach') ? 'coach' : f.kind.startsWith('ground') ? 'ground' : f.kind === 'tv-missing' ? 'tv' : f.kind === 'table-mismatch' ? 'table' : 'stuck'

/** How serious: a likely new coach is red, a source conflict amber, something missing grey, a correction that can go blue */
const levelOf = (f: Finding) =>
  f.kind === 'coach-acting-replaced' || f.kind === 'match-stuck' ? 'bad' : f.kind.endsWith('-missing') ? 'info' : f.kind === 'coach-fix-done' ? 'tidy' : 'warn'
const LEVEL_WORD = { bad: 'Vigtigt', warn: 'Uenige kilder', info: 'Mangler', tidy: 'Kan ryddes op' }
/** The important first, what is only missing last */
const RANK = { bad: 0, warn: 1, tidy: 2, info: 3 }

/** "DBU nævner X, API-Sports nævner Y som træner. Vi viser X." → the three as chips */
function sources(text: string) {
  const m = /DBU nævner (.+?), API-Sports nævner (.+?) som [^.]+\.\s*Vi viser (.+?)\.$/.exec(text)
  return m ? { dbu: m[1], api: m[2], shown: m[3] } : undefined
}

const BY: Record<string, string> = { claude: 'James', admin: 'Dig', kode: 'Fra start' }

export default async function DatavagtPage() {
  if (!(await isAdmin())) redirect('/admin')
  const report = readDatavagt()
  const fixes = readRettelser()
  const badges = await getBadges()
  const now = Date.now()
  const week = fixes.log.filter((l) => now - l.at < 7 * 86_400_000)
  const byClaude = week.filter((l) => l.by === 'claude').length
  const count = (g: Group) => report.findings.filter((f) => groupOf(f) === g).length
  const important = report.findings.filter((f) => levelOf(f) === 'bad').length
  const logo = (f: Finding) => (f.club.includes(' – ') ? undefined : badges[f.club])

  return (
    <div className="page">
      <div className="clubs admin dv">
        <AdminNav current="/admin/datavagt" />
        <header className="dv-head">
          <div>
            <h1 className="feed__title">Datavagt</h1>
            <p className="muted small">
              {report.at ? `Seneste tjek ${when(report.at)}` : 'Endnu ikke kørt'} · tjekkes hver nat, James retter kl. 7, mail kl. 9
            </p>
          </div>
          <DatavagtRunButton />
        </header>

        <div className="dash-tiles dv-tiles">
          <div className={`dash-tile${important ? ' is-bad' : report.findings.length ? ' is-warn' : ''}`}>
            <span className="dash-tile__label">Åbne fund</span>
            <strong className="dash-tile__value">{report.findings.length}</strong>
            <span className="dash-tile__sub">{important ? `${important} vigtige` : report.findings.length ? 'ingen vigtige' : 'alt i orden'}</span>
          </div>
          {GROUPS.map((g) => (
            <a key={g.key} className={`dash-tile${count(g.key) ? ' is-warn' : ''}`} href={`#dv-${g.key}`}>
              <span className="dash-tile__label">{g.title}</span>
              <strong className="dash-tile__value">{count(g.key)}</strong>
              <span className="dash-tile__sub">{count(g.key) ? 'åbne fund' : 'i orden'}</span>
            </a>
          ))}
          <div className="dash-tile">
            <span className="dash-tile__label">Rettet, 7 dage</span>
            <strong className="dash-tile__value">{week.length}</strong>
            <span className="dash-tile__sub">{byClaude} af James</span>
          </div>
        </div>

        <div className="dv-grid">
          <div className="dv-main">
            {report.findings.length === 0 && (
              <section className="panel pad dv-empty">
                <strong>Alt i orden</strong>
                <span className="muted">Datavagten fandt intet ved seneste tjek.</span>
              </section>
            )}
            {GROUPS.filter((g) => count(g.key)).map((g) => (
              <section key={g.key} id={`dv-${g.key}`} className="panel pad dv-group">
                <header className="dv-group__head">
                  <h2 className="panel__title">
                    {g.title} <span className="dv-count">{count(g.key)}</span>
                  </h2>
                  <span className="muted small">{g.hint}</span>
                </header>
                <ul className="dv-list">
                  {report.findings
                    .filter((f) => groupOf(f) === g.key)
                    .sort((a, b) => RANK[levelOf(a)] - RANK[levelOf(b)])
                    .map((f) => {
                      const level = levelOf(f)
                      const src = sources(f.text)
                      const img = logo(f)
                      return (
                        <li key={f.id} className={`dv-item is-${level}`}>
                          <span className="dv-item__logo" aria-hidden="true">
                            {/* eslint-disable-next-line @next/next/no-img-element -- the club's own logo */}
                            {img ? <img src={img} alt="" /> : <span>{f.club.slice(0, 2).toUpperCase()}</span>}
                          </span>
                          <div className="dv-item__body">
                            <div className="dv-item__top">
                              <strong>{f.url ? <a href={f.url}>{f.club}</a> : f.club}</strong>
                              <span className={`dv-tag is-${level}`}>{LEVEL_WORD[level]}</span>
                            </div>
                            {src ? (
                              <div className="dv-src">
                                <span className="dv-chip">
                                  <b>DBU</b> {src.dbu}
                                </span>
                                <span className="dv-chip">
                                  <b>API-Sports</b> {src.api}
                                </span>
                                <span className="dv-chip is-shown">
                                  <b>Vi viser</b> {src.shown}
                                </span>
                              </div>
                            ) : (
                              <p className="dv-item__text">{f.text}</p>
                            )}
                          </div>
                          <div className="dv-item__act">
                            {/* A stuck match of the source's: its result typed, fetched again or hidden */}
                            {f.kind === 'match-stuck' && SOURCE_GAME.test(f.id.slice('match-stuck:'.length)) && <StuckMatchActions game={f.id.slice('match-stuck:'.length)} label={f.club} />}
                            <DatavagtButton id={f.id} />
                          </div>
                        </li>
                      )
                    })}
                </ul>
              </section>
            ))}
          </div>

          <aside className="dv-side">
            <section className="panel pad">
              <h2 className="panel__title">Seneste rettelser</h2>
              {fixes.log.length ? (
                <ol className="dv-log">
                  {[...fixes.log]
                    .reverse()
                    .slice(0, 12)
                    .map((l, i) => (
                      <li key={i}>
                        <span className={`dv-who is-${l.by}`}>{BY[l.by] ?? l.by}</span>
                        <span className="dv-log__text">{l.text}</span>
                        <span className="dv-log__when">{short(l.at)}</span>
                      </li>
                    ))}
                </ol>
              ) : (
                <p className="muted small">Ingen endnu.</p>
              )}
            </section>

            <section className="panel pad">
              <h2 className="panel__title">
                Trænere vi retter <span className="dv-count">{Object.keys(fixes.coaches).length}</span>
              </h2>
              <ul className="dv-coaches">
                {Object.entries(fixes.coaches).map(([slug, c]) => (
                  <li key={slug} title={c.why}>
                    <a href={`/klub/${slug}`}>{slug}</a>
                    <strong>
                      {c.name}
                      {c.acting && <span className="dv-tag is-info">Konstitueret</span>}
                    </strong>
                    <span className={`dv-who is-${c.by}`}>{BY[c.by] ?? c.by}</span>
                  </li>
                ))}
              </ul>
            </section>

            {(Object.keys(fixes.confirmed).length > 0 || Object.keys(fixes.dismissed).length > 0) && (
              <section className="panel pad">
                <h2 className="panel__title">Bekræftet af dig</h2>
                <p className="muted small">Spørges der ikke om igen, før kilderne ændrer sig.</p>
                {Object.keys(fixes.confirmed).length > 0 && (
                  <details className="dv-more">
                    <summary>Trænere ({Object.keys(fixes.confirmed).length})</summary>
                    <ul className="dv-coaches">
                      {Object.entries(fixes.confirmed).map(([slug, c]) => (
                        <li key={slug}>
                          <a href={`/klub/${slug}`}>{slug}</a>
                          <strong>{c.name}</strong>
                          <span className="dv-log__when">{short(c.at)}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {Object.keys(fixes.dismissed).length > 0 && (
                  <details className="dv-more">
                    <summary>Fund ({Object.keys(fixes.dismissed).length})</summary>
                    <ul className="dv-dismissed">
                      {Object.entries(fixes.dismissed).map(([id, d]) => (
                        <li key={id}>
                          <span>{d.text}</span>
                          <DatavagtButton id={id} undo />
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </section>
            )}

            {Object.keys(matchOverrides().overrides).length > 0 && (
              <section className="panel pad">
                <h2 className="panel__title">Rettede kampe</h2>
                <p className="muted small">Resultater du har tastet, og kampe du har skjult. Fortryd, og kampen står igen som kilden siger.</p>
                <ul className="dv-dismissed">
                  {Object.entries(matchOverrides().overrides).map(([game, o]) => (
                    <li key={game}>
                      <span>
                        {o.label ?? game}: {o.hidden ? 'skjult' : o.score ? `resultat ${o.score[0]}-${o.score[1]}` : ''}
                      </span>
                      <ResetMatchButton game={game} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </aside>
        </div>
      </div>
    </div>
  )
}
