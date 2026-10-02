import type { Metadata } from "next";
import Link from "next/link";
import { shownDivisions, sportOf } from "../../data/leagues";
import {
  AD_PLACEMENTS,
  MAX_CREATIVES,
  FEED_AD_EVERY_ROWS,
  FEED_AD_FIRST_ROWS,
} from "../../data/ads";
import { JsonLd, breadcrumbLd, webPageLd } from "../../lib/jsonld";
import { SITE_NAME, paths } from "../../lib/site";
import { loadRealData } from "../../lib/realdata";
import { trackingConfig } from "../../lib/tracking";
import { sportById } from "../../sports";
import { Faq } from "../../components/Faq";
import type { FaqItem } from "../../lib/faq";
import { Flag } from "../../components/Flag";
import { LeadForm } from "../../components/LeadForm";
import "../widget/widget.css";
import "./annoncering.css";

// Advertising on Matchly: the placements we sell (src/data/ads.ts), where they show, who sees them and a form for advertisers.
// Leads land in /admin/reklamer ("Henvendelser om annoncering"); prices are agreed per advertiser, so none are written here.

export const dynamic = "force-dynamic";

const TITLE = "Annoncering på Matchly";

export const metadata: Metadata = {
  title: {
    absolute: "Annoncering på Matchly – nå sportsfans, mens kampen spilles",
  },
  description:
    "Annoncér på Matchly: topbanner, bannere i kamplisten, sidebanner, bannere på kamp- og klubsider og helsidesannonce. Sportsinteresserede læsere i Danmark, der følger Superligaen, Premier League, Bundesliga og flere – uden sporing og cookies. Hør om priser.",
  alternates: { canonical: "/annoncering" },
};

const FAQ: FaqItem[] = [
  {
    q: "Hvad koster det?",
    a: "Prisen afhænger af plads, periode og om pladsen deles med andre annoncører. Skriv til os, så får du et tilbud og aktuelle besøgstal samme dag.",
  },
  {
    q: "Hvilke filer skal vi levere?",
    a: "Et billede i pladsens mål til computer og et til mobil (JPG, PNG, WebP eller animeret GIF) og det link, annoncen skal føre til. Vi gør det klar og lægger det op – ofte samme dag.",
  },
  {
    q: "Kan vi bruge vores eget annoncesystem?",
    a: "Ja. Pladserne kan også vise annoncekode fra et annoncesystem eller netværk. Sporer koden læserne, kører den først, når læseren har sagt ja i vores cookie-banner.",
  },
  {
    q: "Må vi annoncere for spil og odds?",
    a: 'Ja, hvis annoncen følger spillereglerne og markedsføringsloven. Vi mærker den som spilreklame og viser altid "18+ · Spil ansvarligt · StopSpillet.dk" ved siden af.',
  },
  {
    q: "Kan flere annoncører dele en plads?",
    a: `Ja, op til ${MAX_CREATIVES} på samme plads. De skiftes hver halve time hen over døgnet, og en læser ser den samme annonce under hele sit besøg.`,
  },
  {
    q: "Hvordan ved vi, at annoncen vises?",
    a: "Du kan altid se den på siden, og vi sender et skærmbillede, når den er lagt op. Vi aftaler periode og plads skriftligt, før den går i luften.",
  },
];

const ICON = {
  live: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />,
  target: (
    <path
      d="M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Zm0 4a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 4a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z"
      fill="none"
      strokeWidth="2"
    />
  ),
  shield: (
    <path
      d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6l-8-3Zm-3.5 9 2.5 2.5 4.5-5"
      fill="none"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  hand: (
    <path
      d="M7 11V6.5a1.5 1.5 0 0 1 3 0V11m0-5.5v-1a1.5 1.5 0 0 1 3 0V11m0-4.5a1.5 1.5 0 0 1 3 0V12m0-2a1.5 1.5 0 0 1 3 0v4a6 6 0 0 1-6 6h-1.5a6 6 0 0 1-4.8-2.4L4 14.5a1.6 1.6 0 0 1 2.5-2L7 13"
      fill="none"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
};

const BENEFITS = [
  {
    icon: ICON.live,
    title: "Når kampen spilles",
    text: "Læserne er her, mens der spilles: live-stillinger, mål og statistik. Annoncen står midt i det, de følger med i.",
  },
  {
    icon: ICON.target,
    title: "Sportsfans i Danmark",
    text: "Siden er dansk og handler om sport. Dem, der ser annoncen, følger Superligaen, Premier League, Bundesliga, ishockey og basketball.",
  },
  {
    icon: ICON.shield,
    title: "Uden sporing",
    text: "Bannerne sætter ingen cookies og sporer ingen. Derfor vises de for alle læsere – også dem, der siger nej til cookies.",
  },
  {
    icon: ICON.hand,
    title: "Direkte aftale",
    text: "Ingen auktion og ingen mellemled. Vi aftaler plads, periode og pris med dig og lægger annoncen op samme dag.",
  },
];

// What each placement is and where it shows (the sizes come from src/data/ads.ts)
const WHERE: Record<
  keyof typeof AD_PLACEMENTS,
  { title: string; text: string; draw: string }
> = {
  top: {
    title: "Topbanner",
    text: "Lige under topbjælken på alle sider – forsiden, kampe, klubber og turneringer. Det første, læseren ser.",
    draw: "is-top",
  },
  feed: {
    title: "Kamplisten",
    text: `Inde i forsidens kampliste: første banner efter ca. ${FEED_AD_FIRST_ROWS} kampe, derefter for hver ca. ${FEED_AD_EVERY_ROWS}. Flere bannere pr. side.`,
    draw: "is-feed",
  },
  side: {
    title: "Sidebanner",
    text: "Forsidens højre kolonne ved siden af kamplisten. Følger med, når læseren ruller (kun på computer).",
    draw: "is-side",
  },
  content: {
    title: "Kamp- og klubsider",
    text: "På kampsider, klubsider og turneringssider mellem indholdet – dér, hvor fansene læser om netop deres hold.",
    draw: "is-content",
  },
  scroll: {
    title: "Helsidesannonce",
    text: "En hel skærm på forsiden, som læseren ruller forbi: billedet står stille bag et vindue i sidens bredde. Én pr. side.",
    draw: "is-scroll",
  },
};

const SPORT_ORDER = { soccer: 0, ice_hockey: 1, basketball: 2 } as Record<
  string,
  number
>;

export default function AdvertisingPage() {
  loadRealData();
  const divisions = [...shownDivisions()].sort(
    (a, b) => (SPORT_ORDER[sportOf(a)] ?? 9) - (SPORT_ORDER[sportOf(b)] ?? 9),
  );
  const sports = [...new Set(divisions.map(sportOf))];
  const clubs = divisions.reduce((n, d) => n + d.clubs.length, 0);
  const countries = new Set(divisions.map((d) => d.country)).size;
  const ownerMail = trackingConfig().owner?.email;
  const formats = (Object.keys(WHERE) as (keyof typeof WHERE)[]).map((id) => ({
    ...WHERE[id],
    id,
    size: AD_PLACEMENTS[id],
  }));
  const px = (s: { width: number; height: number }) =>
    `${s.width} × ${s.height}`;
  return (
    <div className="page wg adv">
      <JsonLd
        data={webPageLd(
          paths.advertising(),
          TITLE,
          new Date(),
          metadata.description ?? undefined,
        )}
      />
      <JsonLd
        data={breadcrumbLd([
          { name: "Annoncering", path: paths.advertising() },
        ])}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQ.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }}
      />

      <section className="wg-hero">
        <span className="wg-hero__m" aria-hidden="true">
          M
        </span>
        <div className="wg-hero__text">
          <h1 className="wg-hero__title adv-hero__title">
            Nå fansene,
            <br />
            <em>mens kampen spilles.</em>
          </h1>
          <p className="wg-hero__lead">
            {SITE_NAME} viser live-stillinger, resultater og statistik for dansk
            og europæisk sport. Din annonce står ved siden af kampene – på
            forsiden, kampsiderne og klubsiderne – uden sporing og uden
            mellemled.
          </p>
          <div className="wg-hero__cta">
            <a className="wg-btn wg-btn--lime" href="#kontakt">
              Hør om priser →
            </a>
            <a className="wg-btn" href="#formater">
              Se formaterne
            </a>
          </div>
          {divisions.length > 0 && (
            <dl className="wg-hero__numbers">
              <div>
                <dt>turneringer</dt>
                <dd>{divisions.length}</dd>
              </div>
              <div>
                <dt>klubber</dt>
                <dd>{clubs}</dd>
              </div>
              <div>
                <dt>lande</dt>
                <dd>{countries}</dd>
              </div>
              <div>
                <dt>sportsgrene</dt>
                <dd>{sports.length}</dd>
              </div>
            </dl>
          )}
        </div>
        <div className="wg-hero__show adv-hero__pitch">
          <div className="adv-hero__card">
            <b>5</b>
            <span>
              <strong>pladser</strong> i standardformater: topbanner,
              kamplisten, sidebanner, kamp- og klubsider og helside.
            </span>
          </div>
          <div className="adv-hero__card">
            <b>0</b>
            <span>
              <strong>cookies.</strong> Bannerne sporer ingen, så de vises for
              alle læsere – også dem, der siger nej i cookie-banneret.
            </span>
          </div>
          <div className="adv-hero__card">
            <b>1</b>
            <span>
              <strong>dag.</strong> Send banneret og linket, så er annoncen på
              siden samme dag.
            </span>
          </div>
        </div>
      </section>

      <section className="wg-benefits">
        {BENEFITS.map((b, i) => (
          <div
            key={b.title}
            className="wg-benefit"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <span className="wg-benefit__icon" aria-hidden>
              <svg
                viewBox="0 0 24 24"
                width="24"
                height="24"
                fill="currentColor"
                stroke="currentColor"
                strokeWidth="0"
              >
                {b.icon}
              </svg>
            </span>
            <h2>{b.title}</h2>
            <p>{b.text}</p>
          </div>
        ))}
      </section>

      <section id="formater">
        <h2 className="wg-h2">Formaterne</h2>
        <div className="adv-formats">
          {formats.map((f) => (
            <article key={f.id} className="adv-format">
              <div className="adv-format__draw" aria-hidden="true">
                <em style={{ top: 30 }} />
                <em style={{ top: 44 }} />
                <em style={{ top: 58 }} />
                <em style={{ top: 72 }} />
                <i className={f.draw}>Annonce</i>
              </div>
              <h3>{f.title}</h3>
              <p className="adv-format__sizes">
                <span title="Computer">{px(f.size.desktop)}</span>
                <span className="is-mobile" title="Mobil">
                  Mobil {px(f.size.mobile)}
                </span>
              </p>
              <p>{f.text}</p>
            </article>
          ))}
          <article className="adv-format">
            <div className="adv-format__draw" aria-hidden="true">
              <em style={{ top: 12 }} />
              <em style={{ top: 72 }} />
              <i className="is-sponsor">Præsenteret af …</i>
            </div>
            <h3>Sponsorat</h3>
            <p className="adv-format__sizes">
              <span>Efter aftale</span>
            </p>
            <p>
              Vil I eje en hel turnering eller klub? Et sponsorat samler
              pladserne på turneringens eller klubbens sider, kampprogram og
              resultater i jeres navn. Skriv, så finder vi formen.
            </p>
          </article>
        </div>
      </section>

      <div className="adv-two">
        <section className="panel adv-panel">
          <h2 className="wg-h2">Hvem ser annoncen?</h2>
          <p>
            Læsere, der følger deres hold tæt: de tjekker stillingen før kampen,
            følger den live og læser statistikken bagefter.
            {divisions.length > 0 &&
              ` Vi dækker ${divisions.length} turneringer med ${clubs} klubber i ${countries} lande – hver med egne sider for kampe, klubber, kampprogram og resultater.`}
          </p>
          {sports.map((sport) => (
            <div key={sport}>
              <p className="adv-sport">{sportById(sport).label}</p>
              <ul className="adv-leagues">
                {divisions
                  .filter((d) => sportOf(d) === sport)
                  .map((d) => (
                    <li key={d.id}>
                      <Link href={paths.league(d.slug)}>
                        <Flag country={d.country} /> {d.name}
                      </Link>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </section>
        <section className="panel adv-panel">
          <h2 className="wg-h2">Sådan viser vi annoncer</h2>
          <ul className="adv-rules">
            <li>
              Altid mærket &quot;Annonce&quot;, så læserne ved, hvad der er
              reklame.
            </li>
            <li>
              Pladsen er reserveret på forhånd, så siden ikke hopper, når
              annoncen kommer frem.
            </li>
            <li>
              Ingen cookies og ingen sporing fra vores bannere – de vises for
              alle læsere.
            </li>
            <li>
              Op til {MAX_CREATIVES} annoncører kan dele en plads og skiftes
              hver halve time.
            </li>
            <li>
              Spilreklamer mærkes og vises altid med &quot;18+ · Spil ansvarligt
              · StopSpillet.dk&quot;.
            </li>
            <li>
              Annoncekode fra et netværk, der sporer, kører først efter læserens
              ja i cookie-banneret.
            </li>
          </ul>
        </section>
      </div>

      <section id="saadan" className="wg-steps">
        <h2 className="wg-h2">Sådan kommer du i gang</h2>
        <ol>
          <li>
            <b>1</b>
            <span>
              <strong>Skriv til os</strong> i formularen herunder. Fortæl, hvad
              I vil annoncere for, og hvornår.
            </span>
          </li>
          <li>
            <b>2</b>
            <span>
              <strong>Vi aftaler</strong> plads, periode og pris – og sender
              aktuelle besøgstal, så du ved, hvad du får.
            </span>
          </li>
          <li>
            <b>3</b>
            <span>
              <strong>Send banneret</strong> i pladsens mål (computer og mobil)
              og linket. Vi lægger det op samme dag.
            </span>
          </li>
        </ol>
      </section>

      <section id="kontakt" className="adv-contact">
        <div>
          <h2 className="wg-h2">Hør om priser</h2>
          <p>
            Skriv, hvem I er, og hvad I vil annoncere for. Så vender vi tilbage
            med et tilbud og aktuelle besøgstal – som regel samme dag.
            {ownerMail && (
              <>
                {" "}
                Du kan også skrive direkte til{" "}
                <a
                  href={`mailto:${ownerMail}?subject=Annoncering på ${SITE_NAME}`}
                >
                  {ownerMail}
                </a>
                .
              </>
            )}
          </p>
          <p>
            Vi sælger kun pladser på vores egen side og kun til annoncer, vi
            selv vil stå inde for.
          </p>
        </div>
        <LeadForm
          endpoint="/api/annoncering/kontakt"
          className="adv-form"
          subject="Virksomhed"
          subjectPlaceholder="Fx Jyske Bank"
          messagePlaceholder="Fx hvad I vil annoncere for, hvilke pladser I tænker på, og hvornår"
          done="Tak! Vi vender tilbage med et tilbud hurtigst muligt."
        />
      </section>

      <Faq items={FAQ} />
    </div>
  );
}
