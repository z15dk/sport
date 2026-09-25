# Scoreline

Sofascore-alternativ for fodbold (DK, DE), ishockey (Metal Ligaen, SHL) og basketball (Basketligaen). Next.js (App Router) + React + TypeScript. UI-tekst er på dansk.

- Alt arbejde skal committes og pushes med det samme. Brugeren kører `npm run live`
  lokalt (http://localhost:5173), som automatisk henter nyeste push og genindlæser siden.
- Brugerens VPS følger branchen via `deploy/update.sh` (systemd-timer hvert minut) og
  udruller hvert push automatisk. Et push der ikke bygger, bliver aldrig udrullet.
- Før push: `npm run lint` og `npm run build` skal være grønne.
- Hver kamp, klub og turnering har sin egen server-renderede side (SEO/GEO) med
  metadata og schema.org JSON-LD (`src/lib/jsonld.tsx`). Nye sider skal have det samme.
- Alle hold kommer fra ét register (`src/data/teams.ts`). Hvert hold dér får automatisk en side
  på `/klub/<slug>`, links, plads på `/klubber` og i sitemap. Nye datakilder skal tilføje deres hold dér.
- Resultaterne er fiktive: siden skal forblive `noindex` (styres af `SITE_INDEXABLE`)
  indtil der kommer rigtige data.
- Alle tider håndteres i dansk tid (`src/lib/time.ts`), så server og browser er enige.
- Ligaer: `src/data/leagues.ts` (dansk fodbold), `germany.ts`, `icehockey.ts`, `basketball.ts`. Hver `Division` har sport, land, sæsonstart, antal opgør og rundedage; sportens regler (scoring, point, live-status) ligger i `src/data/scoring.ts`. En ny liga = en ny `Division`; program, stilling, sider, sitemap og logoer følger automatisk. Klub-id'er skal være unikke på tværs af alle ligaer (tjekkes ved opstart).
- Kampdata: fiktivt sæsonprogram for alle ligaer (`src/data/season.ts`, liga + dansk pokal), andre sportsgrene i `src/data/matches.ts`. Brug altid `shuffle()` med seed – aldrig `sort(() => rand() - 0.5)`, ellers er server og browser uenige; valgfrit live-data fra TheSportsDB (`src/api/thesportsdb.ts`).
- Odds og TV: partnere (bookmaker, kanaler pr. liga) i `src/data/partners.ts`, logoer i `public/logos/bookmakere/` og `public/logos/kanaler/`. Odds er fiktive (`src/data/odds.ts`). Hvor der vises odds, skal "18+ · Spil ansvarligt · StopSpillet.dk" også være synligt.
- Klublogoer: `public/logos/<slug>.*`, ellers TheSportsDB, ellers forbogstaver. Ligalogoer: `public/logos/ligaer/<slug>.*`, ellers TheSportsDB's ligaliste (`src/lib/badges.ts`, `getBadges()` giver ét navn→logo-kort til hele siden).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
