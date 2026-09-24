# Scoreline

Sofascore-alternativ (Vite + React + TypeScript). UI-tekst er på dansk.

- Alt arbejde skal committes og pushes med det samme. Brugeren kører `npm run live`
  lokalt (http://localhost:5173), som automatisk henter nyeste push og genindlæser siden.
- Brugeren ser siden på det private link https://claude.ai/artifact/ND7Wfqp9rYe4ZtG2tgS9j8.
  Efter hver ændring: byg, saml `dist/` til én HTML-fil og genudgiv til samme link.
- Før push: `npm run lint` og `npm run build` skal være grønne.
- Kampdata: TheSportsDB (`src/api/thesportsdb.ts`) med demo-fallback (`src/api/demo.ts`).
