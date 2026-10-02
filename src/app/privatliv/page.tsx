import type { Metadata } from 'next'
import Link from 'next/link'
import { JsonLd, breadcrumbLd } from '../../lib/jsonld'
import { SITE_NAME, paths } from '../../lib/site'

export const metadata: Metadata = {
  title: { absolute: `Privatliv og cookies · ${SITE_NAME}` },
  description: `Sådan behandler ${SITE_NAME} oplysninger: ingen brugerkonti, ingen sporing på tværs af sider, og dine hold gemmes kun i din egen browser.`,
  alternates: { canonical: paths.privacy() },
}

// The privacy policy: what the site keeps about its visitors (next to
// nothing). Also the address Meta and X ask for when the site's apps post to
// our social media accounts.

export default function PrivacyPage() {
  return (
    <div className="page">
      <JsonLd data={breadcrumbLd([{ name: 'Privatliv og cookies', path: paths.privacy() }])} />
      <article className="clubs prose">
        <h1 className="feed__title">Privatliv og cookies</h1>

        <section className="panel prose__section">
          <h2 className="panel__title">Kort fortalt</h2>
          <p>
            {SITE_NAME} har ingen brugerkonti og beder dig ikke om oplysninger. Vi sporer dig ikke på tværs af andre hjemmesider, og vi sælger ikke oplysninger til nogen.
          </p>
        </section>

        <section className="panel prose__section">
          <h2 className="panel__title">Det gemmes i din browser</h2>
          <p>
            Følger du et hold med ★ Mine hold, gemmes holdene (og små valg, fx at du har lukket et tip) kun i din egen browser (localStorage), så forsiden kan vise dem næste gang. De sendes ikke til os, og du
            sletter dem ved at fjerne holdene igen eller rydde browserens data.
          </p>
        </section>

        <section className="panel prose__section">
          <h2 className="panel__title">Cookies</h2>
          <p>
            Siden sætter ingen cookies for besøgende. Den eneste cookie bruges af redaktionen, når vi logger ind for at redigere siden, og den er nødvendig for
            login. Annoncerne på siden er vores egne aftaler med annoncører: et billede og et link, uden sporing og uden cookies.
          </p>
        </section>

        <section className="panel prose__section">
          <h2 className="panel__title">Besøgsstatistik uden cookies</h2>
          <p>
            Vi tæller, hvor mange der besøger siden, og hvilke sider der bliver set, så vi ved, hvad der er værd at lave mere af. Det sker uden cookies og uden
            at gemme noget i din browser. For at kunne tælle en besøgende én gang om dagen laver serveren en anonym kode ud fra din IP-adresse, din browsertype og
            en hemmelig værdi, der skiftes hver nat og derefter glemmes. Selve IP-adressen gemmes ikke, og koden kan ikke føres tilbage til dig eller følge dig fra
            den ene dag til den næste. Vi gemmer også, hvilken side du kom fra (fx en søgemaskine), og om du bruger mobil eller computer. Tallene deles ikke med
            andre og bruges ikke til reklame. De enkelte visninger slettes efter 35 dage; tilbage bliver kun det samlede antal pr. dag.
          </p>
        </section>

        <section className="panel prose__section">
          <h2 className="panel__title">Serverens logfiler</h2>
          <p>
            Som alle hjemmesider modtager vores server din IP-adresse og browserens type, når du henter en side. Det bruges kun til at holde siden kørende og sikker
            og gemmes ikke længere end nødvendigt.
          </p>
        </section>

        <section className="panel prose__section">
          <h2 className="panel__title">Sociale medier</h2>
          <p>
            Vi poster kampprogram, resultater og tal på vores egne profiler på Facebook, Instagram, Threads og X. Vi indsamler ikke oplysninger om dem, der følger
            profilerne; platformene viser os kun samlede tal som visninger og likes. Platformenes egne privatlivsregler gælder, når du bruger dem.
          </p>
        </section>

        <section className="panel prose__section">
          <h2 className="panel__title">Spørgsmål</h2>
          <p>
            Har du spørgsmål, kan du skrive til os via vores profiler på sociale medier. Læs mere <Link href={paths.about()}>om {SITE_NAME}</Link>.
          </p>
        </section>
      </article>
    </div>
  )
}
