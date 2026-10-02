import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { demoMatch } from '../../../../lib/ticketDemo'
import { DEMO_TYPES, feeFor } from '../../../../lib/ticketShop'
import { loadRealData } from '../../../../lib/realdata'
import { TeamBadge } from '../../../../components/TeamBadge'
import { TicketCheckout } from '../../../../components/TicketCheckout'
import { formatLong, formatTime } from '../../../../lib/time'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Demo: køb billetter', robots: { index: false, follow: false } }

type Params = Promise<{ kamp: string }>

/** The demo's checkout for one match: ticket types, the fee shown in the price, "Køb" (no money taken) */
export default async function DemoCheckout({ params }: { params: Params }) {
  loadRealData()
  const { kamp } = await params
  const m = demoMatch(kamp)
  if (!m) notFound()
  return (
    <div className="page">
      <div className="clubs bs-demo bs-checkout">
        <nav className="crumbs" aria-label="Brødkrummer">
          <Link href="/billetsystem">Billetsystem</Link>
          <span aria-hidden>/</span>
          <Link href="/billetsystem/demo">Demo</Link>
          <span aria-hidden>/</span>
          <span>
            {m.home.name} – {m.away.name}
          </span>
        </nav>
        <p className="bs-banner">
          <strong>Demo</strong> – der trækkes ingen penge, og billetterne gælder ikke ved stadion.
        </p>
        <header className="bs-checkout__head">
          <span className="bs-checkout__teams">
            <TeamBadge link={false} name={m.home.name} src={m.home.badge} colors={m.home.colors} size={56} />
            <span>
              <strong>
                {m.home.name} – {m.away.name}
              </strong>
              <span className="muted">
                {m.league} · {formatLong(m.kickoff)} kl. {formatTime(m.kickoff)}
                {m.venue ? ` · ${m.venue}` : ''}
              </span>
            </span>
            <TeamBadge link={false} name={m.away.name} src={m.away.badge} colors={m.away.colors} size={56} />
          </span>
        </header>
        <TicketCheckout match={m.slug} types={DEMO_TYPES.map((t) => ({ ...t, fee: feeFor(t.price) }))} />
        <p className="muted small">
          Klubbens side for kampen: <Link href={`/billetsystem/demo/klub/${m.slug}`}>salget live</Link> · Indgangen: <Link href={`/billetsystem/demo/scanner?kamp=${m.slug}`}>scanner</Link>
        </p>
      </div>
    </div>
  )
}
