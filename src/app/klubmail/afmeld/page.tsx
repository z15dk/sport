import type { Metadata } from 'next'
import Link from 'next/link'
import { klubmailUnsubscribe } from '../../../lib/klubmail/server'
import { SITE_NAME, paths } from '../../../lib/site'

export const metadata: Metadata = {
  title: { absolute: `Afmeld klubmailen · ${SITE_NAME}` },
  description: 'Afmeld den ugentlige mail om din klub.',
  robots: { index: false, follow: false },
}

// The unsubscribe link in every club mail: one click, no login – the address is deleted at once and the page says so
// (the mail program's own one-click button posts to /api/klubmail/afmeld).

export const dynamic = 'force-dynamic'

export default async function KlubmailUnsubscribePage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const token = String((await searchParams).t ?? '')
  const r = klubmailUnsubscribe(token)
  return (
    <div className="page">
      <article className="clubs prose">
        <h1 className="feed__title">{r || token ? 'Du er afmeldt' : 'Afmeld klubmailen'}</h1>
        <section className="panel prose__section">
          {r ? (
            <p>
              Du får ikke flere mails om {r.clubs.length ? r.clubs.join(', ') : 'din klub'}, og vi har slettet din mailadresse. Du kan altid tilmelde dig igen på
              klubbens side.
            </p>
          ) : token ? (
            <p>Adressen er allerede afmeldt og slettet hos os. Du får ikke flere mails.</p>
          ) : (
            <p>Brug linket nederst i en af vores mails for at afmelde dig. Det virker med ét klik og uden login.</p>
          )}
          <p>
            <Link href={paths.home({})}>Til forsiden</Link> · <Link href={paths.privacy()}>Privatliv</Link>
          </p>
        </section>
      </article>
    </div>
  )
}
