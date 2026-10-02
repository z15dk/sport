import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { demoMatch } from '../../../../../lib/ticketDemo'
import { loadRealData } from '../../../../../lib/realdata'
import { ClubSalesLive } from '../../../../../components/ClubSalesLive'
import { formatLong, formatTime } from '../../../../../lib/time'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Demo: klubbens salg', robots: { index: false, follow: false } }

type Params = Promise<{ kamp: string }>

/** The club's view of one match in the demo: sold, money for the club, scanned at the gate – live */
export default async function DemoClub({ params }: { params: Params }) {
  loadRealData()
  const m = demoMatch((await params).kamp)
  if (!m) notFound()
  return (
    <div className="page">
      <div className="clubs bs-demo">
        <nav className="crumbs" aria-label="Brødkrummer">
          <Link href="/billetsystem">Billetsystem</Link>
          <span aria-hidden>/</span>
          <Link href="/billetsystem/demo">Demo</Link>
          <span aria-hidden>/</span>
          <span>Klubbens salg</span>
        </nav>
        <p className="bs-banner">
          <strong>Demo</strong> – sådan ser {m.home.name} salget til kampen. Tallene er demo-køb, ikke rigtige billetter.
        </p>
        <h1 className="feed__title">
          {m.home.name} – {m.away.name}
          <span>
            {formatLong(m.kickoff)} kl. {formatTime(m.kickoff)} · klubbens salg
          </span>
        </h1>
        <ClubSalesLive match={m.slug} />
        <p className="muted small">
          <Link href={`/billetsystem/demo/${m.slug}`}>Køb flere billetter</Link> · <Link href={`/billetsystem/demo/scanner?kamp=${m.slug}`}>Scanner til indgangen</Link>
        </p>
      </div>
    </div>
  )
}
