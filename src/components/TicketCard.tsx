import type { CSSProperties } from 'react'
import QRCode from 'qrcode'
import { TeamBadge } from './TeamBadge'

// A ticket as the buyer gets it (src/lib/ticketShop.ts): the match, the type and price, and the QR code the gate scans.

export interface TicketCardProps {
  code: string
  label: string
  price: number
  home: string
  away: string
  homeColors?: [string, string]
  awayColors?: [string, string]
  when: string
  venue?: string
  number?: string
  used?: boolean
  demo?: boolean
}

const kr = (n: number) => (n ? `${n.toLocaleString('da-DK', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })} kr.` : 'Gratis')

export async function TicketCard(p: TicketCardProps) {
  const svg = await QRCode.toString(p.code, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0f110c', light: '#ffffff' } })
  // The clubs' colours run through the ticket's top, as on a printed season card
  const c1 = p.homeColors?.[0] ?? '#c6f135'
  const c2 = p.awayColors?.[0] ?? '#c6f135'
  return (
    <article className={`tk${p.used ? ' is-used' : ''}`} style={{ '--c1': c1, '--c2': c2 } as CSSProperties}>
      <div className="tk__head">
        <header className="tk__top">
          <span className="tk__brand">
            Matchly<i>.</i>
          </span>
          <span className="tk__kind">{p.demo ? 'Demo-billet' : 'Billet'}</span>
        </header>
        <div className="tk__teams">
          <span className="tk__team">
            <TeamBadge link={false} name={p.home} colors={p.homeColors} size={48} />
            <strong>{p.home}</strong>
          </span>
          <span className="tk__vs">mod</span>
          <span className="tk__team">
            <TeamBadge link={false} name={p.away} colors={p.awayColors} size={48} />
            <strong>{p.away}</strong>
          </span>
        </div>
        <p className="tk__when">
          {p.when}
          {p.venue ? ` · ${p.venue}` : ''}
        </p>
      </div>
      <div className="tk__cut" aria-hidden />
      <div className="tk__body">
        <div className="tk__qr" role="img" aria-label="QR-kode til indgangen" dangerouslySetInnerHTML={{ __html: svg }} />
        <dl className="tk__facts">
          <div>
            <dt>Billet</dt>
            <dd>{p.label}</dd>
          </div>
          <div>
            <dt>Pris</dt>
            <dd>{kr(p.price)}</dd>
          </div>
          {p.number && (
            <div>
              <dt>Nr.</dt>
              <dd>{p.number}</dd>
            </div>
          )}
        </dl>
      </div>
      {p.used && (
        <p className="tk__used">
          <span>Brugt</span>
        </p>
      )}
    </article>
  )
}
