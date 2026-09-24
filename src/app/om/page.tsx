import type { Metadata } from 'next'
import Link from 'next/link'
import { DIVISIONS, SEASON } from '../../data/danishClubs'
import { JsonLd, breadcrumbLd, organizationLd } from '../../lib/jsonld'
import { INDEXABLE, SITE_NAME, paths } from '../../lib/site'

export const metadata: Metadata = {
  title: 'Om Scoreline – hvem vi er og hvor tallene kommer fra',
  description:
    'Scoreline dækker dansk fodbold fra Superligaen til 3. division. Læs hvordan vi indsamler resultater, hvor ofte siden opdateres, og hvem der står bag.',
  alternates: { canonical: paths.about() },
}

export default function AboutPage() {
  const clubs = DIVISIONS.reduce((n, d) => n + d.clubs.length, 0)
  return (
    <div className="page">
      <JsonLd data={organizationLd()} />
      <JsonLd data={breadcrumbLd([{ name: `Om ${SITE_NAME}`, path: paths.about() }])} />
      <article className="clubs prose">
        <h1 className="feed__title">Om {SITE_NAME}</h1>

        {!INDEXABLE && (
          <p className="banner">
            Scoreline er under udvikling. Alle kampe, resultater og tal på siden er fiktive og kun til test.
          </p>
        )}

        <section className="panel prose__section">
          <h2 className="panel__title">Hvad er Scoreline?</h2>
          <p>
            Scoreline samler resultater, kampprogram, stillinger og statistik for dansk herrefodbold. Vi dækker alle{' '}
            {clubs} klubber i <Link href={paths.league('superliga')}>Superligaen</Link>,{' '}
            <Link href={paths.league('1-division')}>1. division</Link>,{' '}
            <Link href={paths.league('2-division')}>2. division</Link> og{' '}
            <Link href={paths.league('3-division')}>3. division</Link> i sæson {SEASON} – også de rækker, som andre
            sider kun dækker sparsomt.
          </p>
        </section>

        <section className="panel prose__section">
          <h2 className="panel__title">Hvor kommer tallene fra?</h2>
          <p>
            Hver kamp har sin egen side med resultat, kampstatistik, klubbernes sæson og de seneste indbyrdes opgør.
            Stillinger regnes ud fra alle spillede kampe i rækken, og hver side viser, hvornår den sidst er opdateret.
          </p>
          <p>
            {INDEXABLE
              ? 'Resultaterne kommer fra vores datapartnere og kontrolleres automatisk, før de vises.'
              : 'I udviklingsfasen genereres kampe og resultater automatisk, så vi kan teste siden. Når vi går live, skiftes de ud med officielle resultater.'}
          </p>
        </section>

        <section className="panel prose__section">
          <h2 className="panel__title">Hvor ofte opdateres siden?</h2>
          <p>
            Kampsider opdateres løbende, mens kampen spilles, og stillinger opdateres, så snart en kamp er slut. Klub- og
            turneringssider viser altid dagens kampe.
          </p>
        </section>

        <section className="panel prose__section">
          <h2 className="panel__title">Klublogoer og navne</h2>
          <p>
            Klubnavne og logoer tilhører klubberne. Vi bruger dem kun til at vise, hvilke hold der spiller.
          </p>
        </section>
      </article>
    </div>
  )
}
