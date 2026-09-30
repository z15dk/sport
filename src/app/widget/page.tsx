import type { Metadata } from 'next'
import { shownDivisions, sportOf } from '../../data/leagues'
import { standings } from '../../data/season'
import { JsonLd, breadcrumbLd, webPageLd } from '../../lib/jsonld'
import { SITE_URL } from '../../lib/site'
import { loadRealData } from '../../lib/realdata'
import { Faq } from '../../components/Faq'
import type { FaqItem } from '../../lib/faq'
import { WidgetBuilder, type WidgetLeague } from '../../components/WidgetBuilder'

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

export default function WidgetPage() {
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
  const title = 'Gratis ligatabel til din hjemmeside'
  return (
    <div className="page">
      <JsonLd data={webPageLd('/widget', title, new Date(), metadata.description ?? undefined)} />
      <JsonLd data={breadcrumbLd([{ name: 'Ligatabel til din hjemmeside', path: '/widget' }])} />
      <article className="clubs prose">
        <h1 className="feed__title">{title}</h1>
        <p className="lead">
          Vis den aktuelle stilling på din klubs eller dit fanforums hjemmeside. Tabellen opdateres automatisk efter hver kamp,
          passer til mobil og computer og er gratis at bruge.
        </p>
        <WidgetBuilder leagues={leagues} site={SITE_URL} />
        <section className="panel prose__section">
          <h2 className="panel__title">Sådan gør du</h2>
          <ol className="widget-steps">
            <li>Vælg liga og eventuelt dit eget hold, som så bliver fremhævet i tabellen.</li>
            <li>Kopiér koden og indsæt den på din side, hvor tabellen skal stå – i WordPress som en &quot;Tilpasset HTML&quot;-blok.</li>
            <li>Færdig. Tabellen opdaterer sig selv; du skal aldrig røre koden igen.</li>
          </ol>
        </section>
        <Faq items={FAQ} />
      </article>
    </div>
  )
}
