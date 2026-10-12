import type { Metadata } from 'next'
import Link from 'next/link'
import { TeamBadge } from '../../../components/TeamBadge'
import { clubDigest, klubmailConfirm } from '../../../lib/klubmail/server'
import { whenLong } from '../../../lib/klubmail/build'
import { SITE_NAME, paths } from '../../../lib/site'

export const metadata: Metadata = {
  title: { absolute: `Tak for din tilmelding · ${SITE_NAME}` },
  description: 'Din klub i indbakken hver mandag morgen.',
  robots: { index: false, follow: false },
}

// The link in the confirmation mail of "Din klub i indbakken" (double opt-in): the pending clubs become confirmed,
// and the first mail comes next Monday morning (src/lib/klubmail/server.ts). A proper thank-you in the site's own design
// (the owner's wish 12/10-2026): the lime top with the big M and the club's logo, what the mail brings with the club's
// real next match and place in the table, and the way on.

export const dynamic = 'force-dynamic'

export default async function KlubmailConfirmPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const r = klubmailConfirm(String((await searchParams).t ?? ''))
  if (!r) {
    return (
      <div className="page">
        <section className="tak tak--fejl">
          <span className="tak__m" aria-hidden>
            M
          </span>
          <div className="tak__copy">
            <p className="tak__kicker">Din klub i indbakken</p>
            <h1 className="tak__title">Linket virker ikke</h1>
            <p className="tak__lead">Linket er for gammelt eller allerede brugt. Et link gælder i 7 dage. Tilmeld dig igen på klubbens side, så sender vi en ny mail.</p>
            <div className="tak__actions">
              <Link className="tak__btn" href={paths.clubs()}>
                Find din klub →
              </Link>
            </div>
          </div>
        </section>
      </div>
    )
  }
  const names = r.clubs.map((c) => c.name)
  const who = names.length <= 1 ? (names[0] ?? 'din klub') : `${names.slice(0, -1).join(', ')} og ${names.at(-1)}`
  const first = r.clubs[0]
  // The first club's real next match and place, as the Monday mail will show them
  const digest = first ? await clubDigest(first.slug).catch(() => undefined) : undefined
  const me = digest?.table?.find((row) => row.me)
  const next = digest?.next
  return (
    <div className="page">
      <section className="tak">
        <span className="tak__m" aria-hidden>
          M
        </span>
        <div className="tak__copy">
          <p className="tak__kicker">Din klub i indbakken</p>
          <h1 className="tak__title">Tak for din støtte!</h1>
          <p className="tak__lead">
            Du er tilmeldt <strong>{who}</strong>. Hver mandag morgen får du ugens overblik fra Matchly – og du hjælper samtidig et lille, uafhængigt dansk
            fodboldsite med at vokse. Det betyder meget for os.
          </p>
        </div>
        {first && (
          <div className="tak__club">
            <TeamBadge name={first.name} size={96} link={false} />
            <span className="tak__clubname">{first.name}</span>
          </div>
        )}
      </section>

      <div className="tak__grid">
        <section className="panel tak__card">
          <p className="tak__label">Første mail</p>
          <p className="tak__big">Mandag kl. 7</p>
          <p className="tak__small">Sidste resultat, næste kamp med TV-kanal og stillingen. Ét klik i mailen afmelder dig igen.</p>
        </section>
        <section className="panel tak__card">
          <p className="tak__label">Næste kamp</p>
          {next ? (
            <>
              <p className="tak__big">
                {next.home ? 'Hjemme' : 'Ude'} mod {next.opponent}
              </p>
              <p className="tak__small">
                {whenLong(next.kickoff)}
                {next.tv ? ` · ${next.tv}` : ''}
              </p>
              {next.slug && (
                <Link className="tak__link" href={paths.match(next.slug)}>
                  Til kampen →
                </Link>
              )}
            </>
          ) : (
            <p className="tak__small">Ingen kamp i kalenderen lige nu. Den kommer i mailen, så snart den er sat.</p>
          )}
        </section>
        <section className="panel tak__card">
          <p className="tak__label">Stillingen</p>
          {me ? (
            <>
              <p className="tak__big">
                Nr. {me.rank}
                {me.points !== undefined ? ` · ${me.points} point` : ''}
              </p>
              <p className="tak__small">
                {digest?.league ? `${digest.league} efter ${me.played} kampe.` : `Efter ${me.played} kampe.`}
              </p>
            </>
          ) : (
            <p className="tak__small">Tabellen kommer med i mailen, når sæsonen er i gang.</p>
          )}
        </section>
      </div>

      <section className="panel tak__more">
        <div>
          <h2 className="tak__h2">Følg med hele ugen</h2>
          <p className="tak__small">Live-resultater, kampprogram og TV-guide – gratis og på dansk.</p>
        </div>
        <div className="tak__actions">
          {first && (
            <Link className="tak__btn" href={paths.club(first.slug)}>
              Alt om {first.name} →
            </Link>
          )}
          <Link className="tak__btn tak__btn--ghost" href={paths.clubs()}>
            Tilmeld flere hold
          </Link>
          <Link className="tak__btn tak__btn--ghost" href="/tv">
            Fodbold i TV
          </Link>
        </div>
      </section>
    </div>
  )
}
