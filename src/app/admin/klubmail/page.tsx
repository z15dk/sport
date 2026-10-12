import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AdminNav } from '../../../components/admin/AdminNav'
import { sportOf } from '../../../data/leagues'
import { seasonClubs } from '../../../data/season'
import { isAdmin } from '../../../lib/admin'
import { klubmailMail, klubmailStatus } from '../../../lib/klubmail/server'
import { mailReady } from '../../../lib/mail'
import { loadRealData } from '../../../lib/realdata'
import { SITE_URL } from '../../../lib/site'
import { formatTime } from '../../../lib/time'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Klubmail', robots: { index: false, follow: false } }

// "Din klub i indbakken" (src/lib/klubmail): how many get the weekly club mail, per club, the last run, and the mail
// for a chosen club shown here ("Vis eksempel", nothing is sent) or sent to the owner's own address only.

const short = (ms: number) => {
  const d = new Date(ms)
  return `${d.toLocaleDateString('da-DK', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Copenhagen' })} ${formatTime(d)}`
}
const STOPPED: Record<string, string> = { cap: 'stoppede ved dagens loft – resten sendes ved næste kørsel', error: 'stoppede ved en fejl – prøves igen om 5 min.', done: 'alle har fået ugens mail' }

export default async function KlubmailAdminPage({ searchParams }: { searchParams: Promise<{ klub?: string; sendt?: string; fejl?: string }> }) {
  if (!(await isAdmin())) redirect('/admin')
  const q = await searchParams
  loadRealData()
  const s = klubmailStatus()
  const football = seasonClubs().filter(({ division }) => sportOf(division) === 'soccer')
  const divisions = [...new Map(football.map(({ division }) => [division.id, division])).values()]
  const chosen = q.klub ?? s?.clubs[0]?.slug ?? football[0]?.club.slug
  const preview = chosen ? await klubmailMail([chosen], `${SITE_URL}/klubmail/afmeld`).catch(() => undefined) : undefined
  const subscribed = (s?.clubs ?? []).filter((c) => !football.some(({ club }) => club.slug === c.slug))
  return (
    <div className="page">
      <div className="clubs admin ko">
        <AdminNav current="/admin/klubmail" />
        <h1 className="feed__title">Klubmail</h1>
        <p className="muted">
          &quot;Din klub i indbakken&quot;: fans tilmelder sig på klubsiderne (og under Mine hold) og bekræfter i en mail. Hver mandag kl. 7 får de én mail med
          sidste resultat, næste kamp med TV-kanal, stillingen og de nyeste artikler om deres klubber – 20 mails i minuttet og højst {s?.cap ?? 400} om dagen
          i alt; resten sendes de næste dage (til og med onsdag).
        </p>
        {!mailReady() && <p className="social-msg is-error">Mail er ikke sat op endnu – det gøres under Sociale medier → Indstillinger. Uden den kan ingen tilmelde sig.</p>}
        {!s && <p className="social-msg is-error">Databasen kunne ikke åbnes (klubmail.db).</p>}
        {q.sendt && <p className="social-msg is-ok">Testmailen er sendt til din egen adresse.</p>}
        {q.fejl && <p className="social-msg is-error">{q.fejl}</p>}

        {s && (
          <div className="dash-tiles">
            <div className="dash-tile">
              <span className="dash-tile__label">Tilmeldte</span>
              <strong className="dash-tile__value">{s.confirmed}</strong>
              <span className="dash-tile__sub">bekræftede adresser</span>
            </div>
            <div className="dash-tile">
              <span className="dash-tile__label">Venter</span>
              <strong className="dash-tile__value">{s.pending}</strong>
              <span className="dash-tile__sub">ikke bekræftet (slettes efter 7 dage)</span>
            </div>
            <div className="dash-tile">
              <span className="dash-tile__label">Afmeldt</span>
              <strong className="dash-tile__value">{s.unsubscribed}</strong>
              <span className="dash-tile__sub">{s.unsubscribed30} de sidste 30 dage</span>
            </div>
            <div className="dash-tile">
              <span className="dash-tile__label">30 dage</span>
              <strong className="dash-tile__value">{s.signups30}</strong>
              <span className="dash-tile__sub">tilmeldinger, {s.confirms30} bekræftet</span>
            </div>
            <div className="dash-tile">
              <span className="dash-tile__label">Ugens mail{s.week ? ` (uge ${Number(s.week.split('-W')[1])})` : ''}</span>
              <strong className="dash-tile__value">{s.sentThisWeek}</strong>
              <span className="dash-tile__sub">sendt</span>
            </div>
            <div className={`dash-tile${s.sentToday >= s.cap ? ' is-warn' : ''}`}>
              <span className="dash-tile__label">I dag</span>
              <strong className="dash-tile__value">
                {s.sentToday} / {s.cap}
              </strong>
              <span className="dash-tile__sub">mails i alt (med bekræftelser)</span>
            </div>
          </div>
        )}

        <section className="panel pad ko-group">
          <h2 className="panel__title">Seneste kørsel</h2>
          {s?.lastRun ? (
            <p>
              {short(s.lastRun.at)} · uge {Number((s.lastRun.week ?? '').split('-W')[1]) || '?'}: {s.lastRun.sent} sendt
              {s.lastRun.refused ? `, ${s.lastRun.refused} afvist af mailserveren` : ''}
              {s.lastRun.skipped ? `, ${s.lastRun.skipped} uden nyt (ikke sendt)` : ''}
              {s.lastRun.left ? `, ${s.lastRun.left} venter` : ''} – {STOPPED[s.lastRun.stopped ?? ''] ?? s.lastRun.stopped}
              {s.lastRun.error && <span className="social-msg is-error"> Fejl: {s.lastRun.error}</span>}
            </p>
          ) : (
            <p className="muted">Ingen kørsel endnu. Den første går mandag kl. 7.</p>
          )}
        </section>

        <section className="panel pad ko-group">
          <h2 className="panel__title">Pr. klub</h2>
          {s?.clubs.length ? (
            <div className="table-wrap">
              <table className="table table--compact">
                <thead>
                  <tr>
                    <th>Klub</th>
                    <th className="num">Tilmeldte</th>
                    <th className="num">Venter</th>
                  </tr>
                </thead>
                <tbody>
                  {s.clubs.map((c) => (
                    <tr key={c.slug}>
                      <td>
                        <a href={c.href}>{c.name}</a>
                      </td>
                      <td className="num">{c.confirmed}</td>
                      <td className="num">{c.pending}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">Ingen tilmeldte endnu.</p>
          )}
        </section>

        <section className="panel pad ko-group" id="eksempel">
          <h2 className="panel__title">Vis eksempel</h2>
          <form method="get" action="/admin/klubmail#eksempel" className="ko-form ko-form--note">
            <label>
              <span>Klub</span>
              <select name="klub" defaultValue={chosen}>
                {subscribed.length > 0 && (
                  <optgroup label="Tilmeldte klubber">
                    {subscribed.map((c) => (
                      <option key={c.slug} value={c.slug}>
                        {c.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                {divisions.map((d) => (
                  <optgroup key={d.id} label={d.name}>
                    {football
                      .filter(({ division }) => division.id === d.id)
                      .map(({ club }) => (
                        <option key={club.slug} value={club.slug}>
                          {club.name}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <button type="submit" className="pill">
              Vis eksempel
            </button>
          </form>
          {chosen && (
            <form method="post" action="/api/admin/klubmail" className="ko-form">
              <input type="hidden" name="klub" value={chosen} />
              <button type="submit" className="pill is-active" disabled={!mailReady() || !preview}>
                Send testmail til mig
              </button>
              <span className="muted small">Kun til din egen adresse (Sociale medier → Indstillinger) – ingen tilmeldte får noget.</span>
            </form>
          )}
          {preview ? (
            <>
              <p className="small" style={{ marginTop: 14 }}>
                <strong>Emne:</strong> {preview.subject}
              </p>
              <iframe title="Eksempel på klubmailen" srcDoc={preview.html} sandbox="" style={{ width: '100%', maxWidth: 640, height: 1500, border: '1px solid var(--line)', borderRadius: 12, background: '#eceee7', marginTop: 8 }} />
              <details style={{ marginTop: 10 }}>
                <summary className="small">Tekstudgaven</summary>
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{preview.text}</pre>
              </details>
            </>
          ) : (
            <p className="muted" style={{ marginTop: 12 }}>
              Klubben har ingen kampe eller stilling at skrive om lige nu – den får ingen mail denne uge.
            </p>
          )}
        </section>
      </div>
    </div>
  )
}
