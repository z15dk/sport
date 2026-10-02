import type { Metadata } from 'next'
import Link from 'next/link'
import { demoMatches } from '../../../lib/ticketDemo'
import { loadRealData } from '../../../lib/realdata'
import { TeamBadge } from '../../../components/TeamBadge'
import { formatLong, formatTime } from '../../../lib/time'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Demo: køb billetter', robots: { index: false, follow: false } }

/** The demo's start: real coming home matches of Danish clubs to buy (demo) tickets for */
export default function TicketDemo() {
  loadRealData()
  const matches = demoMatches()
  return (
    <div className="page">
      <div className="clubs bs-demo">
        <nav className="crumbs" aria-label="Brødkrummer">
          <Link href="/billetsystem">Billetsystem</Link>
          <span aria-hidden>/</span>
          <span>Demo</span>
        </nav>
        <p className="bs-banner">
          <strong>Demo</strong> – rigtige kampe, men der trækkes ingen penge, og billetterne gælder ikke ved stadion.
        </p>
        <header className="bs-hero">
          <div>
            <span className="bs-hero__kicker is-plain">Demo · rigtige kampe</span>
            <h1>Vælg en kamp</h1>
            <p className="bs-hero__lead">Kommende hjemmekampe i dansk fodbold. Køb billetter, scan dem på en anden telefon, og se salget hos klubben – live.</p>
          </div>
          <div className="bs-hero__actions">
            <Link className="wg-btn wg-btn--lime" href="/billetsystem/demo/scanner">
              Åbn scanneren
            </Link>
            <Link className="wg-btn" href="/billetsystem/demo/salg">
              Klubbens salg
            </Link>
            <Link className="wg-btn" href="/billetsystem">
              Om billetsystemet
            </Link>
          </div>
        </header>
        {matches.length === 0 ? (
          <p className="panel muted pad">Ingen kommende kampe lige nu.</p>
        ) : (
          <ul className="bs-matches">
            {matches.map((m) => (
              <li key={m.id}>
                <Link href={`/billetsystem/demo/${m.slug}`} prefetch={false}>
                  <span className="bs-matches__when">
                    <b>{m.kickoff.toLocaleDateString('da-DK', { day: 'numeric', timeZone: 'Europe/Copenhagen' })}</b>
                    <span>{m.kickoff.toLocaleDateString('da-DK', { month: 'short', timeZone: 'Europe/Copenhagen' }).replace('.', '')}</span>
                  </span>
                  <span className="bs-matches__teams">
                    <span>
                      <TeamBadge link={false} name={m.home.name} src={m.home.badge} colors={m.home.colors} size={28} /> {m.home.name}
                    </span>
                    <span>
                      <TeamBadge link={false} name={m.away.name} src={m.away.badge} colors={m.away.colors} size={28} /> {m.away.name}
                    </span>
                  </span>
                  <span className="bs-matches__league">
                    {formatLong(m.kickoff)} · kl. {formatTime(m.kickoff)}
                    <em>{m.league}</em>
                  </span>
                  <span className="bs-matches__go">Køb billetter</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
