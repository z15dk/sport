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

## Drift på egen server (VPS)

På en Debian/Ubuntu-server installeres alt med én kommando:

```bash
curl -fsSL https://raw.githubusercontent.com/z15dk/sport/claude/sofascore-alternativ-forside-r7xj0k/deploy/install.sh | sudo bash
```

Med domæne og HTTPS (DNS skal pege på serveren):

```bash
curl -fsSL https://raw.githubusercontent.com/z15dk/sport/claude/sofascore-alternativ-forside-r7xj0k/deploy/install.sh | sudo DOMAIN=ditdomæne.dk bash
```

Serveren tjekker GitHub hvert minut. Nye commits bygges i deres egen mappe og tages
først i brug, når bygget lykkes (`deploy/update.sh`). Indstillinger ligger i
`/opt/scoreline/env`; log: `journalctl -u scoreline -f`.

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

- Synlig "Opdateret"-tid samt `WebPage.dateModified` på kamp-, klub- og turneringssider
- Spørgsmål og svar (med `FAQPage`-data) på kamp-, klub- og turneringssider
- "Om Scoreline" (`/om`) med `Organization`-data og en sidefod, der linker til alle rækker
- IndexNow (`/indexnow.txt`): giver Bing m.fl. besked, så snart en kamp er slut

**Siden er sat til `noindex`, og `robots.txt` blokerer alle crawlere**, fordi
resultaterne er fiktive. IndexNow er også slået fra.

### Når vi går live

1. Rigtige resultater skal være på plads.
2. Sæt i `/opt/scoreline/env` på serveren: `SITE_URL=https://det-rigtige-domæne.dk`,
   `SITE_INDEXABLE=true` og `INDEXNOW_KEY=<openssl rand -hex 16>`.
3. Byg igen: `sudo scoreline-update --force` (indstillingerne bages ind ved bygget).
4. Tilmeld domænet i Google Search Console og Bing Webmaster Tools og indsend `/sitemap.xml`.

## Klublogoer

Logoer findes i denne rækkefølge:

1. En fil i `public/logos/<klub-slug>.svg|png|webp|jpg` (fx `fc-koebenhavn.png`)
2. Klubbens logo fra TheSportsDB (caches i et døgn)
3. Klubbens forbogstaver i klubfarverne

## Data

Kampe og resultater er fiktive. For de danske rækker findes et helt sæsonprogram
(`src/data/season.ts`): én ligarunde om ugen fra 17. juli og pokalrunder om onsdagen.
Stillinger, klubsider og forsiden bygger alle på det samme program, så tallene hænger sammen. Klubberne for sæson 2026/27 står
i `src/data/danishClubs.ts`. På forsiden kan man skifte til live-data fra
TheSportsDB, som dog ikke dækker de lavere danske rækker.

## Scripts

- `npm run live` – udviklingsserver der selv henter nyeste version
- `npm run dev` – udviklingsserver
- `npm run build` / `npm start` – produktionsbuild og -server
- `npm run lint` – oxlint og TypeScript
