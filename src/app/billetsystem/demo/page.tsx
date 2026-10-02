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
        <h1 className="feed__title">
          Vælg en kamp
          <span>Kommende hjemmekampe i dansk fodbold</span>
        </h1>
        <p className="muted small">
          Prøv også <Link href="/billetsystem/demo/scanner">scanneren</Link> på en anden telefon, og følg salget i klubbens oversigt fra kampens side.
        </p>
        {matches.length === 0 ? (
          <p className="panel muted pad">Ingen kommende kampe lige nu.</p>
        ) : (
          <ul className="bs-matches">
            {matches.map((m) => (
              <li key={m.id}>
                <Link href={`/billetsystem/demo/${m.slug}`} prefetch={false}>
                  <span className="bs-matches__when">
                    {formatLong(m.kickoff)}
                    <strong>{formatTime(m.kickoff)}</strong>
                  </span>
                  <span className="bs-matches__teams">
                    <span>
                      <TeamBadge link={false} name={m.home.name} src={m.home.badge} colors={m.home.colors} size={24} /> {m.home.name}
                    </span>
                    <span>
                      <TeamBadge link={false} name={m.away.name} src={m.away.badge} colors={m.away.colors} size={24} /> {m.away.name}
                    </span>
                  </span>
                  <span className="bs-matches__league muted small">{m.league}</span>
                  <span className="bs-matches__go">Køb billetter →</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
