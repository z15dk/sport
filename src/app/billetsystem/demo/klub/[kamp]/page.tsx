import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { demoMatch } from '../../../../../lib/ticketDemo'
import { loadRealData } from '../../../../../lib/realdata'
import { ClubSalesLive } from '../../../../../components/ClubSalesLive'
import { formatLong, formatTime } from '../../../../../lib/time'
import { findClub } from '../../../../../data/matchInsights'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Demo: klubbens salg', robots: { index: false, follow: false } }

type Params = Promise<{ kamp: string }>

/** The club's view of one match in the demo: sold, money for the club, scanned at the gate – live */
export default async function DemoClub({ params }: { params: Params }) {
  loadRealData()
  const m = demoMatch((await params).kamp)
  if (!m) notFound()
  const clubSlug = findClub(m.home.name)?.club.slug
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
        <header className="bs-hero">
          <div>
            <span className="bs-hero__kicker is-live">Klubbens salg · live</span>
            <h1>
              {m.home.name}
              <span> mod </span>
              {m.away.name}
            </h1>
            <ul className="bs-hero__chips">
              <li>{formatLong(m.kickoff)}</li>
              <li>Kl. {formatTime(m.kickoff)}</li>
              {m.venue && <li>{m.venue}</li>}
            </ul>
          </div>
          <div className="bs-hero__actions">
            <Link className="wg-btn wg-btn--lime" href={`/billetsystem/demo/scanner?kamp=${m.slug}`}>
              Scanner til indgangen
            </Link>
            <Link className="wg-btn" href={`/billetsystem/demo/${m.slug}`}>
              Køb flere billetter
            </Link>
            {clubSlug && (
              <Link className="wg-btn" href={`/billetsystem/demo/salg/${clubSlug}`}>
                Hele klubbens salg
              </Link>
            )}
          </div>
        </header>
        <ClubSalesLive match={m.slug} />
      </div>
    </div>
  )
}
