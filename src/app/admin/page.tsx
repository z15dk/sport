import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { adminPassword, isAdmin } from '../../lib/admin'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Admin', robots: { index: false, follow: false } }

type SearchParams = Promise<{ fejl?: string }>

/** Login to the admin pages */
export default async function AdminLogin({ searchParams }: { searchParams: SearchParams }) {
  if (await isAdmin()) redirect('/admin/klubber')
  const { fejl } = await searchParams
  return (
    <div className="page">
      <div className="clubs prose admin-login">
        <h1 className="feed__title">Admin</h1>
        {!adminPassword() ? (
          <section className="panel prose__section">
            <p>Admin er lukket, fordi der ikke er sat en adgangskode.</p>
            <p>
              Læg en linje med <code>ADMIN_PASSWORD=din-kode</code> i <code>/opt/scoreline/env</code> på serveren og genstart med{' '}
              <code>systemctl restart scoreline</code>.
            </p>
          </section>
        ) : (
          <form className="panel prose__section admin-form" method="post" action="/api/admin/login">
            <label>
              Adgangskode
              <input type="password" name="password" autoComplete="current-password" required autoFocus />
            </label>
            {fejl && (
              <p className="unverified" role="alert">
                {fejl === 'vent' ? 'For mange forsøg – vent et minut.' : 'Forkert adgangskode.'}
              </p>
            )}
            <button className="pill is-active" type="submit">
              Log ind
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
