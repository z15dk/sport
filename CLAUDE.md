# Scoreline

Sofascore-alternativ for dansk fodbold. Next.js (App Router) + React + TypeScript. UI-tekst er på dansk.

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
- Kampdata: fiktivt sæsonprogram for de danske rækker (`src/data/season.ts`, liga + pokal), andre sportsgrene i `src/data/matches.ts`. Brug altid `shuffle()` med seed – aldrig `sort(() => rand() - 0.5)`, ellers er server og browser uenige; valgfrit live-data fra TheSportsDB (`src/api/thesportsdb.ts`).
- Klublogoer: `public/logos/<slug>.*`, ellers TheSportsDB, ellers forbogstaver (`src/lib/badges.ts`).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
