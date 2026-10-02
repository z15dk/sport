import type { Metadata } from 'next'
import Link from 'next/link'
import { formatLong, formatTime } from '../../../../lib/time'
import { TicketScanner } from '../../../../components/TicketScanner'
import { demoMatch } from '../../../../lib/ticketDemo'
import { loadRealData } from '../../../../lib/realdata'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Scanner', robots: { index: false, follow: false } }

/** The gate's scanner: the phone's camera reads the QR codes (or the code is typed), green = in, red = no */
export default async function DemoScanner({ searchParams }: { searchParams: Promise<{ kamp?: string }> }) {
  loadRealData()
  const kamp = (await searchParams).kamp
  const m = kamp ? demoMatch(kamp) : undefined
  return (
    <div className="page">
      <div className="clubs bs-demo">
        <nav className="crumbs" aria-label="Brødkrummer">
          <Link href="/billetsystem">Billetsystem</Link>
          <span aria-hidden>/</span>
          <Link href="/billetsystem/demo">Demo</Link>
          <span aria-hidden>/</span>
          <span>Scanner</span>
        </nav>
        <div className="bs-scanpage">
          <header className="bs-hero bs-hero--compact">
            <div>
              <span className="bs-hero__kicker is-plain">Indgangen</span>
              <h1>Scanner</h1>
              <p className="bs-hero__lead">{m ? `${m.home.name} – ${m.away.name} · ${formatLong(m.kickoff)} kl. ${formatTime(m.kickoff)}` : 'Alle demo-kampe'}</p>
            </div>
          </header>
          <TicketScanner match={m?.slug} />
        </div>
      </div>
    </div>
  )
}
