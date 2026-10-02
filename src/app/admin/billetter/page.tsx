import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AdminNav } from '../../../components/admin/AdminNav'
import { ClubTicketField, TicketList } from '../../../components/admin/TicketAdmin'
import { isAdmin } from '../../../lib/admin'
import { DEFAULT_CLUB_TICKETS, ticketConfig, ticketStats } from '../../../lib/tickets'
import { leads } from '../../../lib/ticketShop'
import { DIVISIONS, sportOf, type Division } from '../../../data/leagues'
import { seasonClubs } from '../../../data/season'
import type { Club } from '../../../data/club'
import { formatDayMonth, isoDate } from '../../../lib/time'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Billetter · Admin', robots: { index: false, follow: false } }

/** "Køb billetter": each club's ticket shop, tournament rules, exceptions per match, partner codes and the clicks */
export default async function AdminTickets() {
  if (!(await isAdmin())) redirect('/admin')
  const cfg = ticketConfig()
  const stats = ticketStats()
  // The clubs that play this season, by league (the register's list where the season has none)
  const byDivision = new Map<string, Club[]>()
  for (const { club, division } of seasonClubs()) byDivision.set(division.id, [...(byDivision.get(division.id) ?? []), club])
  const leagues: { division: Division; clubs: Club[] }[] = DIVISIONS.map((d) => ({ division: d, clubs: byDivision.get(d.id) ?? d.clubs })).filter((l) => l.clubs.length)
  const linkOf = (id: string) => (id in cfg.clubs ? cfg.clubs[id] : DEFAULT_CLUB_TICKETS[id])
  // Danish football first (the leagues the links were found for); the rest folded away
  const danish = leagues.filter((l) => l.division.countryCode === 'DK' && sportOf(l.division) === 'soccer')
  const missing = danish.flatMap((l) => l.clubs).filter((c) => linkOf(c.id) === undefined)
  const nameOf = new Map(leagues.flatMap((l) => l.clubs.map((c) => [c.id, c.name] as const)))

  const League = ({ division, clubs }: { division: Division; clubs: Club[] }) => {
    const done = clubs.filter((c) => linkOf(c.id)).length
    return (
      <>
        <h3 className="ticket-league">
          {division.name} <span className="muted small">· {done} af {clubs.length} har link</span>
        </h3>
        <ul className="ticket-rows">
          {clubs.map((c) => (
            <ClubTicketField key={c.id} id={c.id} name={c.name} saved={cfg.clubs[c.id]} found={DEFAULT_CLUB_TICKETS[c.id]} />
          ))}
        </ul>
      </>
    )
  }

  return (
    <div className="page">
      <div className="clubs admin">
        <AdminNav current="/admin/billetter" />
        <h1 className="feed__title">Billetter</h1>
        <p className="muted small">
          &quot;Køb billetter&quot; står på kampsiden (i resultatbjælken, kun før kampstart) og på klubsiden. Linket findes i denne rækkefølge: undtagelse for kampen → hjemmeholdets billetside → regel for turneringen → ingen knap. Klik
          tælles og sendes videre til billetsalget (med partnerkode, hvis du har sat én for udbyderen).
        </p>

        <section className="tiles tiles--club" aria-label="Billetklik">
          <div className="tile tile--lime">
            <span className="tile__label">Klik, 30 dage</span>
            <strong className="tile__value">{stats?.total ?? 0}</strong>
          </div>
          <div className="tile tile--ink">
            <span className="tile__label">I dag</span>
            <strong className="tile__value">{stats?.days.find((d) => d.day === isoDate(Date.now()))?.clicks ?? 0}</strong>
          </div>
          <div className="tile tile--blush">
            <span className="tile__label">Danske fodboldklubber uden link</span>
            <strong className="tile__value">{missing.length}</strong>
          </div>
          <div className="tile tile--lime">
            <span className="tile__label">Partnerkoder</span>
            <strong className="tile__value">{Object.keys(cfg.partners).length}</strong>
          </div>
        </section>

        {missing.length > 0 && (
          <section className="panel">
            <h2 className="panel__title">Mangler link</h2>
            <p className="muted small pad">
              Dem har vi ikke fundet med sikkerhed – udfyld dem herunder (eller vælg &quot;Ingen billetsalg&quot; ved at gemme et tomt felt): {missing.map((c) => c.name).join(', ')}.
            </p>
          </section>
        )}

        {(() => {
          // Clubs that asked about our own ticket system (the form on /billetsystem)
          const list = leads()
          return (
            <section className="panel">
              <h2 className="panel__title">Henvendelser om billetsystemet ({list.length})</h2>
              <p className="muted small pad">
                Fra formularen på <a href="/billetsystem">/billetsystem</a> (skjult for Google, til du åbner den). Demoen: <a href="/billetsystem/demo">/billetsystem/demo</a>.
              </p>
              {list.length > 0 && (
                <ul className="admin-list">
                  {list.map((l) => (
                    <li key={l.id}>
                      <strong>{l.club}</strong> · {l.name} · <a href={`mailto:${l.email}`}>{l.email}</a>
                      {l.phone ? ` · ${l.phone}` : ''} <span className="muted small">· {new Date(l.created).toLocaleString('da-DK', { timeZone: 'Europe/Copenhagen' })}</span>
                      {l.message && <p className="small muted">{l.message}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )
        })()}

        <section className="panel">
          <h2 className="panel__title">Klubbernes billetsider</h2>
          {danish.map((l) => (
            <League key={l.division.id} {...l} />
          ))}
          <details className="ticket-more">
            <summary>Øvrige ligaer ({leagues.length - danish.length})</summary>
            {leagues
              .filter((l) => !danish.includes(l))
              .map((l) => (
                <League key={l.division.id} {...l} />
              ))}
          </details>
        </section>

        <section className="panel">
          <h2 className="panel__title">Regler for turneringer</h2>
          <p className="muted small pad">Et billetlink til alle kampe i en turnering, når hjemmeholdet ikke har sit eget – fx landsholdet eller en pokalfinale. Turneringen skrives som i adressen, fx superliga eller x-denmark-pokalen.</p>
          <TicketList kind="league" entries={Object.entries(cfg.leagues).map(([key, value]) => ({ key, value }))} keyLabel="Turnering" keyPlaceholder="x-denmark-pokalen" valueLabel="Billetlink" valuePlaceholder="https://…" />
        </section>

        <section className="panel">
          <h2 className="panel__title">Undtagelser for enkelte kampe</h2>
          <p className="muted small pad">Et andet link til én kamp (fx en udsolgt kamp eller et særligt salg), eller ingen knap (tomt link). Kampen skrives som i adressen, fx fc-koebenhavn-broendby-if-2026-10-25.</p>
          <TicketList kind="match" entries={Object.entries(cfg.matches).map(([key, value]) => ({ key, value }))} keyLabel="Kamp" keyPlaceholder="fc-koebenhavn-broendby-if-2026-10-25" valueLabel="Billetlink (tomt = ingen knap)" valuePlaceholder="https://…" emptyMeans="ingen knap" />
        </section>

        <section className="panel">
          <h2 className="panel__title">Partnerkoder</h2>
          <p className="muted small pad">Har en billetudbyder et partnerprogram, sættes din kode på alle links til deres domæne (også underdomæner, så eventii.dk gælder rfc.eventii.dk, ob.eventii.dk …).</p>
          <TicketList kind="partner" entries={Object.entries(cfg.partners).map(([key, value]) => ({ key, value }))} keyLabel="Domæne" keyPlaceholder="eventii.dk" valueLabel="Kode" valuePlaceholder="ref=matchly" />
        </section>

        <section className="panel">
          <h2 className="panel__title">Klik de seneste 30 dage</h2>
          {!stats?.total ? (
            <p className="muted small pad">Ingen klik endnu.</p>
          ) : (
            <div className="ticket-stats">
              <div>
                <h3>Pr. klub</h3>
                <ul className="admin-list">
                  {stats.clubs.map((c) => (
                    <li key={c.club}>
                      {nameOf.get(c.club) ?? (c.club || 'Ukendt')} <strong>{c.clicks}</strong>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>Kampe med flest klik</h3>
                <ul className="admin-list">
                  {stats.matches.map((m) => (
                    <li key={m.match}>
                      <a href={`/kamp/${m.match}`}>{m.match}</a> <strong>{m.clicks}</strong>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>Pr. dag</h3>
                <ul className="admin-list">
                  {stats.days
                    .slice()
                    .reverse()
                    .map((d) => (
                      <li key={d.day}>
                        {formatDayMonth(d.day)} <strong>{d.clicks}</strong>
                      </li>
                    ))}
                </ul>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
