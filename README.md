# Scoreline

Et Sofascore-alternativ for dansk fodbold, bygget med Next.js (App Router).

## Kom i gang

```bash
npm install
npm run live
```

Åbn http://localhost:5173. `npm run live` starter udviklingsserveren og henter
automatisk nye commits fra GitHub hvert 15. sekund; siden opdaterer sig selv.
`npm run dev` starter kun serveren.

## Sider

Hver side har sin egen adresse og bliver renderet på serveren, så søgemaskiner
og AI-assistenter kan læse indholdet uden JavaScript.

| Adresse | Indhold |
| --- | --- |
| `/` (`?sport=…&dato=…`) | Dagens kampe, live-bånd, næste kamp |
| `/kamp/<hjemme>-<ude>-<dato>` | Kampside: resultat, kampstatistik, sæsonsammenligning, 5 seneste indbyrdes opgør |
| `/klub/<klub>` | Klubside: sæsonen i tal, seneste og kommende kampe, stilling |
| `/turnering/<række>` | Stilling og dagens kampe for Superliga, 1., 2. og 3. division |
| `/klubber` | Alle 48 klubber |

## SEO og GEO

- Unik `<title>`, beskrivelse og canonical-adresse på hver side
- Strukturerede data (schema.org `SportsEvent`, `SportsTeam`, `SportsOrganization`, `BreadcrumbList`)
- Et kort resumé i almindelig tekst øverst på kamp-, klub- og turneringssider
- `sitemap.xml` og `robots.txt`

**Siden er sat til `noindex`, og `robots.txt` blokerer alle crawlere**, fordi
resultaterne er fiktive. Sæt `SITE_INDEXABLE=true` og `SITE_URL` til det rigtige
domæne, når der kommer rigtige data (se `.env.example`).

## Klublogoer

Logoer findes i denne rækkefølge:

1. En fil i `public/logos/<klub-slug>.svg|png|webp|jpg` (fx `fc-koebenhavn.png`)
2. Klubbens logo fra TheSportsDB (caches i et døgn)
3. Klubbens forbogstaver i klubfarverne

## Data

Kampe og resultater er fiktive og genereres ud fra dato og klubbernes styrke
(`src/data/matches.ts`, `src/data/fixtures.ts`). Klubberne for sæson 2026/27 står
i `src/data/danishClubs.ts`. På forsiden kan man skifte til live-data fra
TheSportsDB, som dog ikke dækker de lavere danske rækker.

## Scripts

- `npm run live` – udviklingsserver der selv henter nyeste version
- `npm run dev` – udviklingsserver
- `npm run build` / `npm start` – produktionsbuild og -server
- `npm run lint` – oxlint og TypeScript
