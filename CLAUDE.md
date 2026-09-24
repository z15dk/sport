# Scoreline

Sofascore-alternativ for dansk fodbold. Next.js (App Router) + React + TypeScript. UI-tekst er på dansk.

- Alt arbejde skal committes og pushes med det samme. Brugeren kører `npm run live`
  lokalt (http://localhost:5173), som automatisk henter nyeste push og genindlæser siden.
- Før push: `npm run lint` og `npm run build` skal være grønne.
- Hver kamp, klub og turnering har sin egen server-renderede side (SEO/GEO) med
  metadata og schema.org JSON-LD (`src/lib/jsonld.tsx`). Nye sider skal have det samme.
- Resultaterne er fiktive: siden skal forblive `noindex` (styres af `SITE_INDEXABLE`)
  indtil der kommer rigtige data.
- Alle tider håndteres i dansk tid (`src/lib/time.ts`), så server og browser er enige.
- Kampdata: fiktive (`src/data/matches.ts`); valgfrit live-data fra TheSportsDB (`src/api/thesportsdb.ts`).
- Klublogoer: `public/logos/<slug>.*`, ellers TheSportsDB, ellers forbogstaver (`src/lib/badges.ts`).
