import type { Metadata } from 'next'
import Link from 'next/link'
import { SEASON, shownDivisions } from '../../data/leagues'
import { JsonLd, breadcrumbLd, organizationLd } from '../../lib/jsonld'
import { CONTACT_EMAIL, SITE_NAME, paths } from '../../lib/site'
import { indexable } from '../../lib/settings'

export const metadata: Metadata = {
  title: { absolute: 'Om Matchly – hvem vi er, hvor tallene kommer fra og hvordan vi skriver' },
  description:
    'Matchly dækker fodbold, ishockey og basketball: Superligaen, Bundesliga, Premier League, Allsvenskan og Eliteserien med flere, Metal Ligaen, SHL og Basketligaen. Læs hvem der står bag, hvordan vi skriver artikler, hvordan vi retter fejl, og hvordan du kontakter redaktionen.',
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

        <section className="panel prose__section" id="artikler">
          <h2 className="panel__title">Hvordan skriver vi artikler?</h2>
          <p>
            I <Link href={paths.articles()}>artiklerne</Link> skriver vi nyheder, optakter og analyser om især dansk fodbold – også de rækker og kvindeligaer, som de store medier sjældent dækker.
          </p>
          <p>
            Hver artikel bygger på navngivne kilder: klubbernes egne meddelelser, DBU, forbundene og danske og udenlandske medier. Fakta om personer, stadioner og TV-kanaler tjekker vi i mindst to kilder, og tal fra vores egne kampdata kontrolleres, før de bruges. Kilderne står nederst i artiklen.
          </p>
          <p>
            Vi bringer ikke citater, vi ikke selv har fået, og vi gætter ikke på det, vi ikke ved. Alle artikler læses og godkendes af redaktionen, før de udgives.
          </p>
        </section>

        <section className="panel prose__section" id="rettelser">
          <h2 className="panel__title">Har du fundet en fejl?</h2>
          <p>
            Skriv til <a href={`mailto:${CONTACT_EMAIL}?subject=Rettelse`}>{CONTACT_EMAIL}</a>, så retter vi det hurtigst muligt. En artikel, der er rettet efter udgivelsen, viser datoen for den seneste opdatering. Fejl i resultater og tabeller retter vi i data, så de er rigtige på alle sider.
          </p>
        </section>

        <section className="panel prose__section" id="redaktionen">
          <h2 className="panel__title">Hvem står bag Matchly?</h2>
          <p>
            Matchly.dk er en del af Z-15. Du kan skrive til redaktionen på <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> – også med tips, ønsker til nye ligaer og henvendelser fra klubber.
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
