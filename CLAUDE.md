# Scoreline

Sofascore-alternativ (Vite + React + TypeScript). UI-tekst er på dansk.

- Alt arbejde skal committes og pushes; hvert push udrulles automatisk til den
  lokale server via `.github/workflows/deploy.yml` (self-hosted runner, se `DEPLOY.md`).
- Før push: `npm run lint` og `npm run build` skal være grønne, ellers fejler udrulningen.
- Kampdata: TheSportsDB (`src/api/thesportsdb.ts`) med demo-fallback (`src/api/demo.ts`).
