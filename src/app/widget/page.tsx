import type { Metadata } from 'next'
import { shownDivisions, sportOf } from '../../data/leagues'
import { standings } from '../../data/season'
import { JsonLd, breadcrumbLd, webPageLd } from '../../lib/jsonld'
import { SITE_URL } from '../../lib/site'
import { loadRealData } from '../../lib/realdata'
import { Faq } from '../../components/Faq'
import type { FaqItem } from '../../lib/faq'
import { WidgetBuilder, type WidgetLeague } from '../../components/WidgetBuilder'
import { WidgetShowcase } from '../../components/WidgetShowcase'

export const metadata: Metadata = {
  title: { absolute: 'Gratis ligatabel til din hjemmeside – Superligaen og flere | Matchly' },
  description:
    'Sæt en gratis, automatisk opdateret ligatabel på din klub- eller fanside: Superligaen, 1. division, Premier League, Bundesliga og flere. Vælg liga, fremhæv dit hold, og kopiér koden.',
  alternates: { canonical: '/widget' },
}

const FAQ: FaqItem[] = [
  { q: 'Koster det noget?', a: 'Nej. Tabellen er gratis, også på kommercielle sider. Vi beder kun om, at linket under tabellen bliver stående.' },
  { q: 'Hvor ofte opdateres tabellen?', a: 'Løbende: stillingen regnes ud fra alle spillede kampe og er ajour få minutter efter hver slutfløjt.' },
  { q: 'Gør den min side langsom?', a: 'Nej. Tabellen hentes først, når den kommer til syne, og indlæses i sin egen ramme ved siden af din side.' },
  { q: 'Virker den i WordPress, Wix og andre systemer?', a: 'Ja, alle steder hvor du kan indsætte HTML. I WordPress bruger du blokken "Tilpasset HTML".' },
]

const SPORT_ORDER = { soccer: 0, ice_hockey: 1, basketball: 2 } as Record<string, number>

const ICON = {
  live: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />,
  star: <path d="m12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9L12 2.5Z" />,
  devices: <path d="M3 5h13v10H3zM1 18h17M19 8h4v12h-4z" fill="none" strokeWidth="2" strokeLinejoin="round" />,
  free: <path d="M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Zm-4 9.5 3 3 5-6" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />,
}
const BENEFITS = [
  { icon: ICON.live, title: 'Altid opdateret', text: 'Stillingen regnes om efter hver kamp. Du skal aldrig røre koden igen.' },
  { icon: ICON.star, title: 'Dit hold i fokus', text: 'Fremhæv din klub med grønt, så fans straks ser placeringen.' },
  { icon: ICON.devices, title: 'Passer til din side', text: 'Lys eller mørk, fuld eller kompakt – og den tilpasser sig mobilen af sig selv.' },
  { icon: ICON.free, title: 'Helt gratis', text: 'Ingen konto, ingen reklamer i tabellen, ingen binding. Kopiér, indsæt, færdig.' },
]

export default async function WidgetPage({ searchParams }: { searchParams: Promise<{ liga?: string }> }) {
  const initial = (await searchParams).liga
  loadRealData()
  const leagues: WidgetLeague[] = shownDivisions()
    .filter((d) => standings(d, Date.now()).length > 1)
    .sort((a, b) => (SPORT_ORDER[sportOf(a)] ?? 9) - (SPORT_ORDER[sportOf(b)] ?? 9))
    .map((d) => ({
      slug: d.slug,
      name: d.name,
      country: d.country,
      clubs: standings(d, Date.now())
        .map((r) => ({ slug: r.club.slug, name: r.club.name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'da')),
    }))
  const clubs = leagues.reduce((n, l) => n + l.clubs.length, 0)
  const countries = new Set(leagues.map((l) => l.country)).size
  const showcase = leagues.slice(0, 6).map((l) => ({ slug: l.slug, name: l.name }))
  const title = 'Gratis ligatabel til din hjemmeside'
  return (
    <div className="page wg">
      <JsonLd data={webPageLd('/widget', title, new Date(), metadata.description ?? undefined)} />
      <JsonLd data={breadcrumbLd([{ name: 'Ligatabel til din hjemmeside', path: '/widget' }])} />

      <section className="wg-hero">
        <span className="wg-hero__m" aria-hidden="true">
          M
        </span>
        <div className="wg-hero__text">
          <p className="wg-hero__kicker">Gratis til klubber, fanklubber og blogs</p>
          <h1 className="wg-hero__title">
            Ligatabellen
            <br />
            <em>på din side.</em>
          </h1>
          <p className="wg-hero__lead">
            Giv dine besøgende den aktuelle stilling – live, flot og uden besvær. Vælg liga, fremhæv dit hold og indsæt én linje kode.
          </p>
          <div className="wg-hero__cta">
            <a className="wg-btn wg-btn--lime" href="#lav">
              Lav din tabel nu →
            </a>
            <a className="wg-btn" href="#saadan">
              Sådan virker det
            </a>
          </div>
          <dl className="wg-hero__numbers">
            <div>
              <dt>ligaer</dt>
              <dd>{leagues.length}</dd>
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
              <dt>kroner</dt>
              <dd>0</dd>
            </div>
          </dl>
        </div>
        <div className="wg-hero__show">
          <WidgetShowcase leagues={showcase} />
        </div>
      </section>

      <section className="wg-benefits">
        {BENEFITS.map((b, i) => (
          <div key={b.title} className="wg-benefit" style={{ animationDelay: `${i * 80}ms` }}>
            <span className="wg-benefit__icon" aria-hidden>
              <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" stroke="currentColor" strokeWidth="0">
                {b.icon}
              </svg>
            </span>
            <h2>{b.title}</h2>
            <p>{b.text}</p>
          </div>
        ))}
      </section>

      <section id="saadan" className="wg-steps">
        <h2 className="wg-h2">Klar på to minutter</h2>
        <ol>
          <li>
            <b>1</b>
            <span>
              <strong>Vælg liga</strong> og dit eget hold, hvis det skal fremhæves.
            </span>
          </li>
          <li>
            <b>2</b>
            <span>
              <strong>Kopiér koden</strong> med ét klik.
            </span>
          </li>
          <li>
            <b>3</b>
            <span>
              <strong>Indsæt den</strong> på din side – i WordPress som en &quot;Tilpasset HTML&quot;-blok.
            </span>
          </li>
        </ol>
      </section>

      <section id="lav" className="wg-make">
        <h2 className="wg-h2">Lav din tabel</h2>
        <div className="wg-chips">
          {leagues.map((l) => (
            <a key={l.slug} href={`/widget?liga=${l.slug}#lav`} className={l.slug === (initial ?? leagues[0]?.slug) ? 'is-on' : undefined}>
              {l.name}
            </a>
          ))}
        </div>
        <WidgetBuilder key={initial ?? ''} leagues={leagues} site={SITE_URL} initial={initial} aside={<Faq items={FAQ} />} />
      </section>
    </div>
  )
}
