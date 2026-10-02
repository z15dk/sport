import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { order } from '../../../../../lib/ticketShop'
import { TicketCard } from '../../../../../components/TicketCard'
import { seasonClub } from '../../../../../data/season'
import { loadRealData } from '../../../../../lib/realdata'
import { formatLong, formatTime } from '../../../../../lib/time'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Dine billetter', robots: { index: false, follow: false } }

type Params = Promise<{ id: string }>

const kr = (n: number) => `${n.toLocaleString('da-DK', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })} kr.`

/** The buyer's tickets after the purchase: one card with a QR code each (the link is the receipt) */
export default async function DemoOrder({ params }: { params: Params }) {
  loadRealData()
  const o = order((await params).id)
  if (!o) notFound()
  const [home, away] = o.title.split(' – ')
  const kickoff = new Date(o.kickoff)
  const when = `${formatLong(kickoff)} kl. ${formatTime(kickoff)}`
  return (
    <div className="page">
      <div className="clubs bs-demo bs-tix">
        {o.demo && (
          <p className="bs-banner">
            <strong>Demo</strong> – billetterne kan scannes i demo-scanneren, men gælder ikke ved stadion.
          </p>
        )}
        <header className="bs-hero">
          <div className="bs-hero__main">
            <span className="bs-hero__kicker">{o.tickets.length === 1 ? 'Din billet er klar' : `Dine ${o.tickets.length} billetter er klar`}</span>
            <h1>
              {home}
              <span> mod </span>
              {away}
            </h1>
            <ul className="bs-hero__chips">
              <li>{formatLong(kickoff)}</li>
              <li>Kl. {formatTime(kickoff)}</li>
              {o.venue && <li>{o.venue}</li>}
            </ul>
          </div>
          <dl className="bs-hero__sum">
            <div>
              <dt>Billetter</dt>
              <dd>{o.tickets.length}</dd>
            </div>
            <div>
              <dt>Betalt</dt>
              <dd>{kr(o.total + o.fee)}</dd>
            </div>
            <div className="is-small">
              <dt>Heraf gebyr</dt>
              <dd>{kr(o.fee)}</dd>
            </div>
          </dl>
        </header>
        <p className="bs-tix-note">
          Vis QR-koden ved indgangen – én kode pr. person. Skru gerne op for lysstyrken.
          {o.demo && ' I den rigtige version kommer billetterne også på mail og i Wallet.'}
        </p>
        <div className="bs-order__tickets">
          {o.tickets.map((t, i) => (
            <TicketCard
              key={t.id}
              code={t.code}
              label={t.label}
              price={t.price}
              home={home}
              away={away ?? ''}
              homeColors={seasonClub(home)?.club.colors}
              awayColors={away ? seasonClub(away)?.club.colors : undefined}
              when={when}
              venue={o.venue || undefined}
              number={`${i + 1} af ${o.tickets.length}`}
              used={!!t.usedAt}
              demo={o.demo}
            />
          ))}
        </div>
        {o.demo && (
          <p className="muted small">
            Prøv nu at scanne en billet: åbn <Link href={`/billetsystem/demo/scanner?kamp=${o.match}`}>scanneren</Link> på en anden telefon. Se også <Link href={`/billetsystem/demo/klub/${o.match}`}>klubbens oversigt</Link>.
          </p>
        )}
      </div>
    </div>
  )
}
