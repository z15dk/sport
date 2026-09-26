import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AdminNav } from '../../../components/admin/AdminNav'
import { isAdmin } from '../../../lib/admin'
import { logoStatus } from '../../../lib/badges'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Logo-status', robots: { index: false, follow: false } }

/** Shows how far the background logo lookup has come and what is missing */
export default async function LogoStatusPage() {
  if (!(await isAdmin())) redirect('/admin')
  const s = logoStatus()
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)
  return (
    <div className="page">
      <div className="clubs prose admin">
        <AdminNav current="/admin/logoer" />
        <h1 className="feed__title">Logo-status</h1>
        <section className="panel prose__section">
          <h2 className="panel__title">Overblik</h2>
          <p>
            Klubber med logo: <strong>{s.clubs.found}</strong> af {s.clubs.total} ({pct(s.clubs.found, s.clubs.total)} %).
            Ligaer med logo: <strong>{s.leagues.found}</strong> af {s.leagues.total}.
          </p>
          <p>
            {s.running ? 'Henter logoer lige nu' : 'Hentning er ikke i gang'} · Ikke tjekket endnu: {s.notChecked} ·
            Forespørgsler siden start: {s.requestsSinceStart} · Seneste kørsel: {s.lastRun ?? 'ikke færdig endnu'}
          </p>
          <p>
            Nøgle: {s.apiKey} · Cache: <code>{s.cacheFile}</code>
          </p>
          {s.lastError && <p className="unverified">Seneste fejl: {s.lastError}</p>}
        </section>
        {s.missing.length > 0 && (
          <section className="panel prose__section">
            <h2 className="panel__title">Uden logo hos TheSportsDB ({s.missing.length})</h2>
            <p>Læg selv en fil i public/logos (klubber) eller public/logos/ligaer (ligaer) for disse:</p>
            <p>{s.missing.join(', ')}</p>
          </section>
        )}
      </div>
    </div>
  )
}
