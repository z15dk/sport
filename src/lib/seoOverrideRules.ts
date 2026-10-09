// The rules for a title and description James sets on a page (src/lib/seoOverrides.ts): what Google shows, in
// Matchly's words. Pure (tests/data/seoOverrideRules.test.ts).

/** The pages whose title and description James may set (a league's earlier seasons too: /turnering/<liga>/<sæson>) */
export const OVERRIDE_PATHS = /^\/((klub|kamp|artikler|opgoer|spiller)\/[a-z0-9-]+|turnering\/[a-z0-9-]+(\/\d{4}-\d{4})?)$/

/** Words Matchly never uses in public: the data sources (and the owner's company), and "fodboldlandshold" (national teams are "<Lands> landshold") */
const FORBIDDEN = /fodboldlandshold|\bDBU\b|API-?Sports|TheSportsDB|SofaScore|Z-15|\|\s*Matchly/i

export function checkOverride(input: { path: string; title?: string; description?: string }): string | undefined {
  if (!OVERRIDE_PATHS.test(input.path)) return 'Kun klub-, turnerings-, kamp-, artikel-, opgørs- og spillersider'
  const title = input.title?.trim()
  const description = input.description?.trim()
  if (!title && !description) return 'Giv en titel og/eller en beskrivelse'
  if (title && (title.length < 15 || title.length > 60)) return `Titlen skal være 15–60 tegn (er ${title.length}) – "| Matchly" sættes på af siden selv`
  if (description && (description.length < 70 || description.length > 160)) return `Beskrivelsen skal være 70–160 tegn (er ${description.length})`
  for (const text of [title, description]) if (text && FORBIDDEN.test(text)) return `"${FORBIDDEN.exec(text)?.[0]}" må ikke stå i titler og beskrivelser`
  return undefined
}
