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
      <div className="clubs bs-demo bs-order">
        {o.demo && (
          <p className="bs-banner">
            <strong>Demo</strong> – billetterne kan scannes i demo-scanneren, men gælder ikke ved stadion.
          </p>
        )}
        <h1 className="feed__title">
          Dine billetter
          <span>
            {o.title} · {when}
          </span>
        </h1>
        <p className="muted">
          {o.tickets.length === 1 ? '1 billet' : `${o.tickets.length} billetter`} · betalt {kr(o.total + o.fee)} (heraf gebyr {kr(o.fee)}). Vis QR-koden ved indgangen – én kode pr. person.
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
