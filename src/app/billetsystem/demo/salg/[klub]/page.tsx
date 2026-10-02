import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { demoClub } from '../../../../../lib/ticketDemo'
import { loadRealData } from '../../../../../lib/realdata'
import { ClubDashboardLive } from '../../../../../components/ClubDashboardLive'
import { TeamBadge } from '../../../../../components/TeamBadge'
import { formatLong, formatTime } from '../../../../../lib/time'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Demo: klubbens salg', robots: { index: false, follow: false } }

type Params = Promise<{ klub: string }>

/** The club's own page in the demo: everything it sells, across all its home matches – live */
export default async function DemoClubDashboard({ params }: { params: Params }) {
  loadRealData()
  const c = demoClub((await params).klub)
  if (!c) notFound()
  const next = c.matches[0]
  return (
    <div className="page">
      <div className="clubs bs-demo">
        <nav className="crumbs" aria-label="Brødkrummer">
          <Link href="/billetsystem">Billetsystem</Link>
          <span aria-hidden>/</span>
          <Link href="/billetsystem/demo">Demo</Link>
          <span aria-hidden>/</span>
          <Link href="/billetsystem/demo/salg">Klubbernes salg</Link>
          <span aria-hidden>/</span>
          <span>{c.club.name}</span>
        </nav>
        <p className="bs-banner">
          <strong>Demo</strong> – sådan følger {c.club.name} sit billetsalg. Tallene er demo-køb, ikke rigtige billetter.
        </p>
        <header className="bs-hero bs-hero--club">
          <div className="bs-hero__club">
            <TeamBadge link={false} name={c.club.name} src={next?.home.badge} colors={c.club.colors} size={64} />
            <div>
              <span className="bs-hero__kicker is-live">Klubbens salg · live</span>
              <h1>{c.club.name}</h1>
              <ul className="bs-hero__chips">
                <li>
                  {c.matches.length} {c.matches.length === 1 ? 'kommende hjemmekamp' : 'kommende hjemmekampe'}
                </li>
                {next && (
                  <li>
                    Næste: {next.away.name} · {formatLong(next.kickoff)} kl. {formatTime(next.kickoff)}
                  </li>
                )}
              </ul>
            </div>
          </div>
          <div className="bs-hero__actions">
            {next && (
              <Link className="wg-btn wg-btn--lime" href={`/billetsystem/demo/scanner?kamp=${next.slug}`}>
                Scanner til næste kamp
              </Link>
            )}
            <Link className="wg-btn" href="/billetsystem/demo">
              Køb billetter
            </Link>
          </div>
        </header>
        <ClubDashboardLive club={c.club.id} matches={c.matches.map((m) => ({ slug: m.slug, title: `${m.home.name} – ${m.away.name}`, kickoff: m.kickoff.getTime() }))} />
      </div>
    </div>
  )
}
