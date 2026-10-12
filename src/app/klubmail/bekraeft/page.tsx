import type { Metadata } from 'next'
import Link from 'next/link'
import { klubmailConfirm } from '../../../lib/klubmail/server'
import { SITE_NAME, paths } from '../../../lib/site'

export const metadata: Metadata = {
  title: { absolute: `Bekræft din tilmelding · ${SITE_NAME}` },
  description: 'Bekræft, at du vil have din klub i indbakken hver mandag.',
  robots: { index: false, follow: false },
}

// The link in the confirmation mail of "Din klub i indbakken" (double opt-in): the pending clubs become confirmed,
// and the first mail comes next Monday morning (src/lib/klubmail/server.ts).

export const dynamic = 'force-dynamic'

export default async function KlubmailConfirmPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const r = klubmailConfirm(String((await searchParams).t ?? ''))
  const names = r?.clubs.map((c) => c.name) ?? []
  const who = names.length <= 1 ? names[0] : `${names.slice(0, -1).join(', ')} og ${names.at(-1)}`
  return (
    <div className="page">
      <article className="clubs prose">
        <h1 className="feed__title">{r ? 'Tak – du er tilmeldt' : 'Linket virker ikke'}</h1>
        <section className="panel prose__section">
          {r ? (
            <>
              <p>
                Du får <strong>{who}</strong> i din indbakke hver mandag morgen: sidste resultat, næste kamp med TV-kanal og stillingen. Den første mail kommer
                næste mandag.
              </p>
              <p>Hver mail har et link, så du kan afmelde dig med ét klik.</p>
              <ul>
                {r.clubs.map((c) => (
                  <li key={c.slug}>
                    <Link href={paths.club(c.slug)}>{c.name}</Link>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>
              Linket er for gammelt eller allerede brugt. Et link gælder i 7 dage. Tilmeld dig igen på klubbens side – så sender vi en ny mail.{' '}
              <Link href={paths.clubs()}>Find din klub</Link>.
            </p>
          )}
        </section>
      </article>
    </div>
  )
}
