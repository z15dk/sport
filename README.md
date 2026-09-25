# Scoreline

Et Sofascore-alternativ bygget med Next.js (App Router).

Dækker fodbold (Superligaen, 1.–3. division, Bundesliga, 2. Bundesliga, 3. Liga, Premier League, Championship, Allsvenskan, Eliteserien), ishockey (Metal Ligaen, SHL) og basketball (Basketligaen).

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
| `/turnering/<række>` | Stilling og dagens kampe, fx `/turnering/superliga` eller `/turnering/bundesliga` |
| `/klubber` | Alle klubber, grupperet efter land og række |

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
siden er under test. IndexNow er også slået fra.

### Når vi går live

1. Rigtige resultater skal være på plads.
2. Sæt i `/opt/scoreline/env` på serveren: `SITE_URL=https://det-rigtige-domæne.dk`,
   `SITE_INDEXABLE=true` og `INDEXNOW_KEY=<openssl rand -hex 16>`.
3. Byg igen: `sudo scoreline-update --force` (indstillingerne bages ind ved bygget).
4. Tilmeld domænet i Google Search Console og Bing Webmaster Tools og indsend `/sitemap.xml`.

## Rigtige resultater

Siden har ingen fiktive resultater: alle kampe og resultater kommer fra TheSportsDB. Et baggrundsjob (`src/lib/realdata.ts`) henter
hele sæsonen for hver liga runde for runde fra TheSportsDB hver 6. time, og runder med kampe omkring nu hvert
10. minut. Data gemmes i `real-data.json` (på VPS'en i `/opt/scoreline/`), så en genstart starter med
dem. Ligaer TheSportsDB ikke har kampe for, vises ikke. Indbyrdes opgør og klubhistorik kommer fra
vores kampdatabase (`football.db`). Odds er eksempler.

Flere ligaer: tilføj en `Division` med `apiLeague`; kendte id'er står i `KNOWN_LEAGUE_IDS` (`src/data/real.ts`).
Status og hold der ikke kan kobles til klubregistret: **`/status/data`**.

## Reklamer

Faste pladser i `src/data/ads.ts`, vist med `<AdSlot>` og mærket "Annonce": topbanner (970×90),
banner mellem ligaerne på forsiden (728×90), sidebanner (300×600) og banner på kamp-, klub- og
turneringssider (300×250). Se `public/ads/README.md`.

## Klub- og ligalogoer

1. Egne filer vinder: `public/logos/<klub-slug>.*`, `public/logos/ligaer/<liga-slug>.*`
   (fx `fc-koebenhavn.png`, `superliga.svg`).
2. Ellers slås logoet op hos TheSportsDB af et baggrundsjob, der starter med serveren. Den gratis
   nøgle tillader ca. 30 opslag i minuttet, så første gennemløb tager omkring 10 minutter; derefter
   ligger logoerne i `logo-cache.json` og overlever genstart og opdateringer. Fundne logoer tjekkes
   igen efter 7 dage, manglende efter 1 dag.
3. Ellers vises klubbens forbogstaver i klubfarverne.

Se hvor langt hentningen er, og hvad der mangler: **`/status/logoer`**.

## Odds og TV

Under hver kommende kamp vises TV-kanal og odds med bookmakerens logo, og kampsiden har en
større odds-boks. Partnerne er pladsholdere: skift navn og link i `src/data/partners.ts` og læg
logoerne i `public/logos/bookmakere/` og `public/logos/kanaler/`. Odds er eksempler og mærket sådan.

## Data

Alle kampe og resultater kommer fra TheSportsDB (se "Rigtige resultater" ovenfor); sæsonen bygges i
`src/data/season.ts`, så stillinger, klubsider og forsiden bygger på de samme kampe. Klublister
(farver, by) står i `src/data/leagues.ts` m.fl. På forsiden kan man også hente dagens kampe direkte
fra TheSportsDB for alle ligaer ("Live-data").

## Scripts

- `npm run live` – udviklingsserver der selv henter nyeste version
- `npm run dev` – udviklingsserver
- `npm run build` / `npm start` – produktionsbuild og -server
- `npm run lint` – oxlint og TypeScript
