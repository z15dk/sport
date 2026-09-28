import type { Metadata } from 'next'
import Link from 'next/link'
import { SEASON, shownDivisions } from '../../data/leagues'
import { JsonLd, breadcrumbLd, organizationLd } from '../../lib/jsonld'
import { SITE_NAME, paths } from '../../lib/site'
import { indexable } from '../../lib/settings'

export const metadata: Metadata = {
  title: { absolute: 'Om Matchly – hvem vi er og hvor tallene kommer fra' },
  description:
    'Matchly dækker fodbold, ishockey og basketball: Superligaen, Bundesliga, Premier League, Allsvenskan og Eliteserien med flere, Metal Ligaen, SHL og Basketligaen. Læs hvordan vi indsamler resultater, hvor ofte siden opdateres, og hvem der står bag.',
  alternates: { canonical: paths.about() },
}

export default function AboutPage() {
  const divisions = shownDivisions()
  const clubs = divisions.reduce((n, d) => n + d.clubs.length, 0)
  return (
    <div className="page">
      <JsonLd data={organizationLd()} />
      <JsonLd data={breadcrumbLd([{ name: `Om ${SITE_NAME}`, path: paths.about() }])} />
      <article className="clubs prose">
        <h1 className="feed__title">Om {SITE_NAME}</h1>

        {!indexable() && (
          <p className="banner">
            Matchly er under udvikling. Odds er eksempler.
          </p>
        )}

        <section className="panel prose__section">
          <h2 className="panel__title">Hvad er Matchly?</h2>
          <p>
            Matchly samler resultater, kampprogram, stillinger og statistik for fodbold, ishockey og basketball i Danmark, Tyskland, England, Spanien, Portugal, Sverige og Norge. Vi dækker alle{' '}
            {clubs} klubber i{' '}
            {divisions.map((d, i) => (
              <span key={d.id}>
                {i > 0 && (i === divisions.length - 1 ? ' og ' : ', ')}
                <Link href={paths.league(d.slug)}>{d.name}</Link>
              </span>
            ))}{' '}
            i sæson {SEASON} – også de rækker, som andre sider kun dækker sparsomt.
          </p>
        </section>

        <section className="panel prose__section">
          <h2 className="panel__title">Hvor kommer tallene fra?</h2>
          <p>
            Hver kamp har sin egen side med resultat, kampstatistik, klubbernes sæson og de seneste indbyrdes opgør.
            Stillinger regnes ud fra alle spillede kampe i rækken, og hver side viser, hvornår den sidst er opdateret.
          </p>
          <p>
            Resultaterne kommer fra vores datapartnere og kontrolleres automatisk, før de vises.
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
