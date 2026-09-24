# Scoreline

Sofascore-alternativ (Vite + React + TypeScript). UI-tekst er på dansk.

- Alt arbejde skal committes og pushes med det samme. Brugeren kører `npm run live`
  lokalt (http://localhost:5173), som automatisk henter nyeste push og genindlæser siden.
- Før push: `npm run lint` og `npm run build` skal være grønne.
- Kampdata: TheSportsDB (`src/api/thesportsdb.ts`) med demo-fallback (`src/api/demo.ts`).
