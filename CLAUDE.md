# Scoreline

Sofascore-alternativ for fodbold (DK, DE, England, SE, NO), ishockey (Metal Ligaen, SHL) og basketball (Basketligaen). Next.js (App Router) + React + TypeScript. UI-tekst er på dansk.

- Alt arbejde skal committes og pushes med det samme. Brugeren kører `npm run live`
  lokalt (http://localhost:5173), som automatisk henter nyeste push og genindlæser siden.
- Brugerens VPS følger branchen via `deploy/update.sh` (systemd-timer hvert minut) og
  udruller hvert push automatisk. Et push der ikke bygger, bliver aldrig udrullet.
- Før push: `npm run lint` og `npm run build` skal være grønne.
- Hver kamp, klub og turnering har sin egen server-renderede side (SEO/GEO) med
  metadata og schema.org JSON-LD (`src/lib/jsonld.tsx`). Nye sider skal have det samme.
- Alle hold kommer fra ét register (`src/data/teams.ts`). Hvert hold dér får automatisk en side
  på `/klub/<slug>`, links, plads på `/klubber` og i sitemap. Nye datakilder skal tilføje deres hold dér.
- Ingen fiktive data: alle kampe og resultater er rigtige. Et baggrundsjob (`src/lib/realdata.ts`) henter hver liga i `DIVISIONS` fra TheSportsDB (id fra `KNOWN_LEAGUE_IDS` i `src/data/real.ts` eller slået op via `apiLeague`) og gemmer i `real-data.json`. Serveren giver samme data til browseren (`RealDataProvider`), og `season.ts` bygger sæsonen af dem. Ligaer uden kampe hos TheSportsDB vises ikke (`shownDivisions()`, 404 på turneringssiden). Klubregistret (`teams.ts`) er de hold, der faktisk spiller; hold uden for vores klubliste får en side med neutralt mærke. Status: `/status/data`.
- Kampdatabase: `football.db` (SQLite, tabeller `matches` og `incidents`) i `/opt/scoreline/data/` på VPS'en eller `STATS_DB`, læses read-only af `src/lib/history.ts` (via `node:sqlite`). Giver rigtige indbyrdes opgør (kampsider), historik (klubsider) og denne sæsons kampe for de danske rækker, som TheSportsDB ikke har (flettes ind i `realdata.ts`, `databaseSeason()`). Hold kobles til klubregistret via navn; status på `/status/data`.
- Statistikbank: `src/lib/archive.ts` gemmer hver færdigspillet kamp fra alle kilder og ligaer (resultat, pause, tilskuere, mål, kort) i `scoreline-arkiv.db` (SQLite, `/opt/scoreline/data/` på VPS'en eller `ARCHIVE_DB`) hvert 5. minut fra baggrundsjobbet. `history.ts` læser den sammen med `football.db` (samme kamp tælles kun én gang).
- Egen statistik: `src/data/stats.ts` regner liga- og klubstatistik (mål pr. kamp, hjemme/ude, over 2,5, begge scorer, clean sheets, mål pr. kvarter, topscorere, kort, tilskuere, pauseresultater, stimer) ud fra sæsonens rigtige kampe. Vises på turneringssider (`LeagueStats`), klubsider (`ClubSeasonStats`) og kampsider ("Før kampen"). Diagramfarver: blå #2f6fdb / orange #ff4a1f (tjekket for farveblindhed).
- Siden er under test og skal forblive `noindex` (styres af `SITE_INDEXABLE`), indtil brugeren siger andet.
- Alle tider håndteres i dansk tid (`src/lib/time.ts`), så server og browser er enige.
- Ligaer: `src/data/leagues.ts` (dansk fodbold), `germany.ts`, `england.ts`, `nordic.ts` (Allsvenskan, Eliteserien – kalenderår, `seasonLabel: '2026'`), `icehockey.ts`, `basketball.ts`. Hver `Division` har sport, land, `apiLeague` (TheSportsDB-navn), antal opgør og klubliste (farver, by). En ny liga = en ny `Division`; data, stilling, sider, sitemap og logoer følger automatisk, når TheSportsDB har kampene. Klub-id'er skal være unikke på tværs af alle ligaer (tjekkes ved opstart).
- Server og browser skal regne det samme: brug aldrig tilfældighed uden seed (`seeded()` i `src/data/fixtures.ts`). "Live-data"-knappen på forsiden henter direkte fra TheSportsDB i browseren (`src/api/thesportsdb.ts`).
- Odds og TV: partnere (bookmaker, kanaler pr. liga) i `src/data/partners.ts`, logoer i `public/logos/bookmakere/` og `public/logos/kanaler/`. Odds er eksempler (`src/data/odds.ts`) og mærket "Eksempel-odds", indtil der er en bookmaker-aftale. Hvor der vises odds, skal "18+ · Spil ansvarligt · StopSpillet.dk" også være synligt.
- Reklamer: pladser i `src/data/ads.ts` (top, feed, side, content), vises med `<AdSlot>` og altid mærket "Annonce". Pladsen reserveres på forhånd; uden annonce vises en pladsholder (slå fra med `NEXT_PUBLIC_AD_PLACEHOLDERS=false`). Billeder i `public/ads/`.
- CMS: `/admin` (login med `ADMIN_PASSWORD` fra serverens env, signeret HttpOnly-cookie, `src/lib/admin.ts`). `/admin/klubber` viser alle klubber med logo og kilde; logoer uploades/nulstilles via `/api/admin/logo` og gemmes i `/opt/scoreline/data/logos/` (`src/lib/customLogos.ts`, filtype tjekkes på indholdet, max 1 MB), serveres af `/api/logo/<slug>`. Uploadede logoer vinder over alt andet.
- Logoer (`src/lib/badges.ts`): lokale filer i `public/logos/` (klubber), `…/ligaer/`, `…/bookmakere/`, `…/kanaler/` vinder. Ellers TheSportsDB via et baggrundsjob (startes i `src/instrumentation.ts`), der holder sig under 30 opslag/minut og gemmer i `logo-cache.json` (på VPS'en i `/opt/scoreline/`). Sider venter aldrig på TheSportsDB. Status: `/status/logoer`. Gratis nøgle er "123" ("3" er forældet og omsættes automatisk).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
