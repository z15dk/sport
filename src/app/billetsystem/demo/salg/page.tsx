import type { Metadata } from 'next'
import Link from 'next/link'
import { demoClubs } from '../../../../lib/ticketDemo'
import { soldByClub } from '../../../../lib/ticketShop'
import { loadRealData } from '../../../../lib/realdata'
import { TeamBadge } from '../../../../components/TeamBadge'
import { formatLong } from '../../../../lib/time'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Demo: klubbernes salg', robots: { index: false, follow: false } }

const kr = (n: number) => `${n.toLocaleString('da-DK', { maximumFractionDigits: 0 })} kr.`

/** The demo's club side: pick a club and follow its sales across all its home matches */
export default function DemoClubsPage() {
  loadRealData()
  const clubs = demoClubs()
  const sold = soldByClub()
  return (
    <div className="page">
      <div className="clubs bs-demo">
        <nav className="crumbs" aria-label="Brødkrummer">
          <Link href="/billetsystem">Billetsystem</Link>
          <span aria-hidden>/</span>
          <Link href="/billetsystem/demo">Demo</Link>
          <span aria-hidden>/</span>
          <span>Klubbernes salg</span>
        </nav>
        <p className="bs-banner">
          <strong>Demo</strong> – sådan følger klubben sit salg. Tallene er demo-køb, ikke rigtige billetter.
        </p>
        <header className="bs-hero">
          <div>
            <span className="bs-hero__kicker is-plain">Klubbens side</span>
            <h1>Vælg din klub</h1>
            <p className="bs-hero__lead">Hver klub har sin egen oversigt: solgt i alt, til klubben, pr. dag, pr. kamp og de seneste køb – live, mens fansene køber.</p>
          </div>
          <div className="bs-hero__actions">
            <Link className="wg-btn wg-btn--lime" href="/billetsystem/demo">
              Køb billetter
            </Link>
            <Link className="wg-btn" href="/billetsystem/demo/scanner">
              Scanneren
            </Link>
          </div>
        </header>
        {clubs.length === 0 ? (
          <p className="panel muted pad">Ingen kommende hjemmekampe lige nu.</p>
        ) : (
          <ul className="bs-clubs">
            {clubs.map(({ club, matches }) => {
              const s = sold.get(club.id)
              const next = matches[0]
              return (
                <li key={club.id}>
                  <Link href={`/billetsystem/demo/salg/${club.slug}`} prefetch={false}>
                    <TeamBadge link={false} name={club.name} src={next?.home.badge} colors={club.colors} size={44} />
                    <span className="bs-clubs__name">
                      <strong>{club.name}</strong>
                      <span>
                        {matches.length} {matches.length === 1 ? 'hjemmekamp' : 'hjemmekampe'}
                        {next && ` · næste ${formatLong(next.kickoff)}`}
                      </span>
                    </span>
                    <span className="bs-clubs__sold">
                      <strong>{s?.sold ?? 0}</strong>
                      <span>{s ? kr(s.revenue) : 'solgt'}</span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
