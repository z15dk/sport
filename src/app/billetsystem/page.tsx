import type { Metadata } from 'next'
import Link from 'next/link'
import { JsonLd, breadcrumbLd, webPageLd } from '../../lib/jsonld'
import { Faq } from '../../components/Faq'
import type { FaqItem } from '../../lib/faq'
import { TicketCard } from '../../components/TicketCard'
import { LeadForm } from '../../components/LeadForm'
import { demoMatches } from '../../lib/ticketDemo'
import { DEMO_TYPES, feeFor } from '../../lib/ticketShop'
import { loadRealData } from '../../lib/realdata'
import { formatLong, formatTime } from '../../lib/time'

// The ticket system we sell to clubs (src/lib/ticketShop.ts): what it is, the price, a demo that works and a form to hear more.

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: { absolute: 'Billetsystem til fodboldklubber – sælg billetter, hvor fansene er | Matchly' },
  description:
    'Matchlys billetsystem til klubber: sælg billetter til hjemmekampene direkte på kampsiden, klubben får hele billetprisen, QR-billetter og scanning med telefonen ved indgangen. Gratis for klubben. Prøv demoen.',
  alternates: { canonical: '/billetsystem' },
  // Hidden from search engines until the owner opens it (pilot phase)
  robots: { index: false, follow: true },
}

const FAQ: FaqItem[] = [
  { q: 'Hvad koster det for klubben?', a: 'Ingenting. Køberen betaler et gebyr på 5 kr. + 3 % pr. billet, og klubben får hele billetprisen. Gratis billetter (fx til børn) koster heller ikke køberen noget.' },
  { q: 'Hvordan får klubben pengene?', a: 'Pengene går direkte til klubbens egen konto hos vores betalingspartner – Matchly holder aldrig på klubbens penge.' },
  { q: 'Skal vi købe udstyr til indgangen?', a: 'Nej. Scanneren er en side på telefonen, der bruger kameraet. Den advarer med det samme, hvis en billet allerede er brugt.' },
  { q: 'Skal vi selv oprette kampene?', a: 'Nej. Vi har allerede jeres kampprogram, så I vælger bare kampen og sætter priser og antal pladser.' },
  { q: 'Hvordan betaler fansene?', a: 'Med kort, Apple Pay, Google Pay eller MobilePay – og billetten kommer med det samme på mail og telefonen.' },
  { q: 'Kan vi prøve det nu?', a: 'Ja. Demoen her på siden virker hele vejen: køb en billet til en rigtig kamp, scan den med telefonen og se salget live. Der trækkes ingen penge i demoen.' },
]

const ICON = {
  fans: <path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 20c0-3.3 2.7-6 6-6s6 2.7 6 6M12 20c0-2.6 1.8-4.8 4-5.6 3.2.2 6 2.5 6 5.6" fill="none" strokeWidth="2" strokeLinecap="round" />,
  calendar: <path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4" fill="none" strokeWidth="2" strokeLinejoin="round" />,
  money: <path d="M3 7h18v10H3zM7 12h.01M17 12h.01M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" fill="none" strokeWidth="2" strokeLinejoin="round" />,
  scan: <path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M7 12h10" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />,
}
const BENEFITS = [
  { icon: ICON.fans, title: 'Fansene er her allerede', text: 'Billetten sælges på kampsiden, klubsiden og i jeres widget – lige dér, hvor fansene tjekker kampen.' },
  { icon: ICON.calendar, title: 'Ingen opsætning', text: 'Jeres kampprogram er allerede hos os. Vælg kampen, sæt priser – og billetterne er til salg.' },
  { icon: ICON.money, title: 'Hele prisen til klubben', text: 'Køberen betaler gebyret. Pengene går direkte til klubbens egen konto.' },
  { icon: ICON.scan, title: 'Scan med telefonen', text: 'QR-billetter og en scanner i browseren. Intet udstyr, ingen app at installere.' },
]

const kr = (n: number) => `${n.toLocaleString('da-DK', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })} kr.`

export default async function TicketSystemPage() {
  loadRealData()
  const example = demoMatches()[0]
  const adult = DEMO_TYPES[0]
  return (
    <div className="page wg bs">
      <JsonLd data={webPageLd('/billetsystem', 'Billetsystem til fodboldklubber', new Date(), metadata.description ?? undefined)} />
      <JsonLd data={breadcrumbLd([{ name: 'Billetsystem til klubber', path: '/billetsystem' }])} />

      <section className="wg-hero">
        <span className="wg-hero__m" aria-hidden="true">
          M
        </span>
        <div className="wg-hero__text">
          <p className="wg-hero__kicker">Billetsystem til klubber · nu med de første pilotklubber</p>
          <h1 className="wg-hero__title">
            Sælg billetterne
            <br />
            <em>hvor fansene er.</em>
          </h1>
          <p className="wg-hero__lead">
            Billetter til jeres hjemmekampe direkte på Matchly – med QR-billet på telefonen, scanning ved indgangen og salget live. Gratis for klubben.
          </p>
          <div className="wg-hero__cta">
            <Link className="wg-btn wg-btn--lime" href="/billetsystem/demo">
              Prøv demoen →
            </Link>
            <a className="wg-btn" href="#kontakt">
              Hør mere
            </a>
          </div>
          <dl className="wg-hero__numbers">
            <div>
              <dt>for klubben</dt>
              <dd>0 kr.</dd>
            </div>
            <div>
              <dt>af billetprisen til klubben</dt>
              <dd>100 %</dd>
            </div>
            <div>
              <dt>gebyr for køberen</dt>
              <dd>5 kr. + 3 %</dd>
            </div>
          </dl>
        </div>
        {example && (
          <div className="wg-hero__show bs-phone">
            <div className="bs-phone__screen">
              <TicketCard
                code="MTK1.EKSEMPEL0000.0000000000"
                label={adult.label}
                price={adult.price}
                home={example.home.name}
                away={example.away.name}
                homeColors={example.home.colors}
                awayColors={example.away.colors}
                when={`${formatLong(example.kickoff)} kl. ${formatTime(example.kickoff)}`}
                venue={example.venue}
                demo
              />
            </div>
          </div>
        )}
      </section>

      <section className="wg-benefits">
        {BENEFITS.map((b, i) => (
          <div key={b.title} className="wg-benefit" style={{ animationDelay: `${i * 80}ms` }}>
            <span className="wg-benefit__icon" aria-hidden>
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor">
                {b.icon}
              </svg>
            </span>
            <h2>{b.title}</h2>
            <p>{b.text}</p>
          </div>
        ))}
      </section>

      <section className="wg-steps">
        <h2 className="wg-h2">I gang på en eftermiddag</h2>
        <ol>
          <li>
            <b>1</b>
            <span>
              <strong>Opret klubben</strong> med CVR og bankkonto hos vores betalingspartner.
            </span>
          </li>
          <li>
            <b>2</b>
            <span>
              <strong>Sæt priser</strong> på hjemmekampene – voksen, pensionist, børn gratis.
            </span>
          </li>
          <li>
            <b>3</b>
            <span>
              <strong>Scan ved indgangen</strong> med en telefon, og følg salget live.
            </span>
          </li>
        </ol>
      </section>

      <section className="bs-try">
        <h2 className="wg-h2">Prøv det selv – det virker</h2>
        <p className="muted">Demoen bruger rigtige kampe fra kampprogrammet. Der trækkes ingen penge, og demo-billetter slettes efter tre dage.</p>
        <div className="bs-try__cards">
          <Link className="bs-try__card" href="/billetsystem/demo">
            <b>1</b>
            <strong>Køb en billet</strong>
            <span>Vælg en kamp og billetter, som en fan gør.</span>
          </Link>
          <Link className="bs-try__card" href="/billetsystem/demo/scanner">
            <b>2</b>
            <strong>Scan ved indgangen</strong>
            <span>Åbn scanneren på en anden telefon, og scan billetten.</span>
          </Link>
          <Link className="bs-try__card" href="/billetsystem/demo">
            <b>3</b>
            <strong>Se salget live</strong>
            <span>Klubbens oversigt: solgt, til klubben, scannet.</span>
          </Link>
        </div>
      </section>

      <section className="bs-price panel">
        <div>
          <h2 className="wg-h2">Prisen</h2>
          <p>
            <strong>Gratis for klubben.</strong> Køberen betaler 5 kr. + 3 % pr. billet, og klubben får hele billetprisen. Gratis billetter koster ingenting.
          </p>
        </div>
        <dl className="bs-price__ex">
          <div>
            <dt>Billet</dt>
            <dd>{kr(adult.price)}</dd>
          </div>
          <div>
            <dt>Gebyr (køber)</dt>
            <dd>{kr(feeFor(adult.price))}</dd>
          </div>
          <div>
            <dt>Køberen betaler</dt>
            <dd>{kr(adult.price + feeFor(adult.price))}</dd>
          </div>
          <div className="is-club">
            <dt>Klubben får</dt>
            <dd>{kr(adult.price)}</dd>
          </div>
        </dl>
      </section>

      <section id="kontakt" className="panel bs-contact">
        <h2 className="wg-h2">Vil I være med?</h2>
        <p className="muted">Skriv til os, så viser vi systemet og sætter jeres næste hjemmekamp til salg.</p>
        <LeadForm />
      </section>

      <Faq items={FAQ} />
    </div>
  )
}
