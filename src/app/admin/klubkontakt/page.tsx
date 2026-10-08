import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AdminNav } from '../../../components/admin/AdminNav'
import { CLUB_CONTACTS } from '../../../data/clubContacts'
import { isAdmin } from '../../../lib/admin'
import { getBadges } from '../../../lib/badges'
import { DAILY_LIMIT, contactEmail, outreachMail, readOutreach, sentToday } from '../../../lib/clubOutreach'
import { mailReady } from '../../../lib/mail'
import { formatTime } from '../../../lib/time'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Klubkontakt', robots: { index: false, follow: false } }

// The clubs of 1.–3. division and the mail about their Matchly page and the free table widget: each club with
// the mail filled in (open "Skriv mail", read, change, send), what has been sent, and the club's answer.

const DIVISIONS = ['1. division', '2. division', '3. division'] as const
const short = (ms: number) => {
  const d = new Date(ms)
  return `${d.toLocaleDateString('da-DK', { day: 'numeric', month: 'short', timeZone: 'Europe/Copenhagen' })} ${formatTime(d)}`
}

export default async function ClubOutreachPage({ searchParams }: { searchParams: Promise<{ sendt?: string; gemt?: string; fejl?: string; klub?: string }> }) {
  if (!(await isAdmin())) redirect('/admin')
  const q = await searchParams
  const s = readOutreach()
  const badges = await getBadges()
  const today = sentToday(s)
  const sentClubs = CLUB_CONTACTS.filter((c) => s.sent[c.slug]?.length).length
  const answered = CLUB_CONTACTS.filter((c) => s.notes[c.slug]).length
  const name = (slug?: string) => CLUB_CONTACTS.find((c) => c.slug === slug)?.name ?? slug
  return (
    <div className="page">
      <div className="clubs admin ko">
        <AdminNav current="/admin/klubkontakt" />
        <h1 className="feed__title">Klubkontakt</h1>
        <p className="muted">
          Fortæl klubberne i 1.–3. division om deres side på Matchly og den gratis live-tabel til deres hjemmeside. Hver klub, der sætter tabellen på, giver et link til Matchly – det hjælper på Google. Mailen er skrevet på forhånd; læs den, ret den, og send. Svar går til din egen mail.
        </p>
        {!mailReady() && <p className="social-msg is-error">Mail er ikke sat op endnu – det gøres under Sociale medier → Indstillinger.</p>}
        {q.sendt && <p className="social-msg is-ok">Mailen til {name(q.sendt)} er sendt.</p>}
        {q.gemt && <p className="social-msg is-ok">Noten om {name(q.gemt)} er gemt.</p>}
        {q.fejl && <p className="social-msg is-error">{name(q.klub)}: {q.fejl}</p>}

        <div className="dash-tiles ko-tiles">
          <div className="dash-tile">
            <span className="dash-tile__label">Sendt</span>
            <strong className="dash-tile__value">
              {sentClubs} / {CLUB_CONTACTS.length}
            </strong>
            <span className="dash-tile__sub">klubber har fået mailen</span>
          </div>
          <div className={`dash-tile${today >= DAILY_LIMIT ? ' is-warn' : ''}`}>
            <span className="dash-tile__label">I dag</span>
            <strong className="dash-tile__value">
              {today} / {DAILY_LIMIT}
            </strong>
            <span className="dash-tile__sub">{today >= DAILY_LIMIT ? 'resten i morgen' : `${DAILY_LIMIT - today} kan sendes endnu`}</span>
          </div>
          <div className="dash-tile">
            <span className="dash-tile__label">Svar noteret</span>
            <strong className="dash-tile__value">{answered}</strong>
            <span className="dash-tile__sub">skriv svaret ved klubben</span>
          </div>
        </div>

        {DIVISIONS.map((div) => (
          <section key={div} className="panel pad ko-group">
            <h2 className="panel__title">{div}</h2>
            <ul className="ko-list">
              {CLUB_CONTACTS.filter((c) => c.division === div).map((c) => {
                const sent = s.sent[c.slug] ?? []
                const mail = outreachMail(c)
                const to = contactEmail(c, s)
                const logo = badges[c.name]
                return (
                  <li key={c.slug} id={c.slug} className={`ko-item${sent.length ? ' is-sent' : ''}`}>
                    <div className="ko-item__head">
                      <span className="ko-item__logo" aria-hidden="true">
                        {/* eslint-disable-next-line @next/next/no-img-element -- the club's own logo */}
                        {logo ? <img src={logo} alt="" /> : <span>{c.name.slice(0, 2).toUpperCase()}</span>}
                      </span>
                      <div className="ko-item__who">
                        <strong>
                          <a href={`/klub/${c.slug}`}>{c.name}</a>
                        </strong>
                        <span className="muted small">
                          {to}
                          {c.note && ` · ${c.note}`} · <a href={`https://${c.website}`}>{c.website}</a>
                        </span>
                      </div>
                      <span className={`ko-state${sent.length ? ' is-sent' : ''}`}>{sent.length ? `Sendt ${short(sent[sent.length - 1].at)}` : 'Ikke sendt'}</span>
                    </div>
                    {s.notes[c.slug] && <p className="ko-note">💬 {s.notes[c.slug]}</p>}
                    <details className="ko-more" open={q.klub === c.slug}>
                      <summary>{sent.length ? 'Se mailen / send igen' : 'Skriv mail'}</summary>
                      <form method="post" action="/api/admin/klubkontakt" className="ko-form">
                        <input type="hidden" name="slug" value={c.slug} />
                        <label>
                          <span>Til</span>
                          <input name="to" type="email" defaultValue={to} required />
                        </label>
                        <label>
                          <span>Emne</span>
                          <input name="subject" defaultValue={mail.subject} required />
                        </label>
                        <label>
                          <span>Tekst</span>
                          <textarea name="body" rows={16} defaultValue={mail.body} required />
                        </label>
                        {sent.length > 0 && <input type="hidden" name="again" value="1" />}
                        <button type="submit" className="pill is-active" disabled={today >= DAILY_LIMIT}>
                          {sent.length ? 'Send igen' : `Send til ${c.name}`}
                        </button>
                      </form>
                      <form method="post" action="/api/admin/klubkontakt" className="ko-form ko-form--note">
                        <input type="hidden" name="slug" value={c.slug} />
                        <input type="hidden" name="action" value="note" />
                        <label>
                          <span>Klubbens svar (note)</span>
                          <input name="note" defaultValue={s.notes[c.slug] ?? ''} placeholder="Fx: Sætter tabellen på i næste uge" />
                        </label>
                        <button type="submit" className="pill">
                          Gem note
                        </button>
                      </form>
                    </details>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
