# Scoreline

Et Sofascore-alternativ. Første version er forsiden med dagens kampe.

## Kom i gang

```bash
npm install
npm run dev
```

Åbn http://localhost:5173. Tilføj `?demo` til URL'en for at bruge demodata i stedet for API'et.

## Forsiden

- Faner for sportsgrene (fodbold, basketball, ishockey, håndbold, tennis)
- Datovælger (±3 dage) og filtre: Alle / Live / Kommende / Afsluttede
- Kampe grupperet efter turnering; live-kampe vises først
- Favorit-turneringer (★) gemmes i browseren og vises øverst
- Søgning på hold og turnering
- Overblik med antal kampe, live, afsluttede og næste kamp
- Lyst/mørkt tema; automatisk opdatering hvert minut på dagens dato

## Data

Kampene hentes fra [TheSportsDB](https://www.thesportsdb.com/free_sports_api)
(`eventsday.php`). Den gratis nøgle `3` bruges som standard; sæt
`VITE_THESPORTSDB_KEY` i `.env` for en anden nøgle (se `.env.example`).
Hvis API'et ikke kan nås, vises demodata, så siden altid kan vises.

API-klienten ligger i `src/api/thesportsdb.ts` og mapper svaret til den fælles
`Match`-type i `src/types.ts`, så en anden udbyder kan skiftes ind senere.

## Scripts

- `npm run dev` – udviklingsserver
- `npm run build` – typecheck og produktionsbuild
- `npm run lint` – oxlint
