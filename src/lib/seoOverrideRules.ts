// The rules for a title and description James sets on a page (src/lib/seoOverrides.ts): what Google shows, in
// Matchly's words. Pure (tests/data/seoOverrideRules.test.ts).

/** The pages whose title and description James may set (a league's earlier seasons too: /turnering/<liga>/<sæson>) */
export const OVERRIDE_PATHS = /^\/((klub|kamp|artikler|opgoer|spiller)\/[a-z0-9-]+|turnering\/[a-z0-9-]+(\/\d{4}-\d{4})?)$/

/** Words Matchly never uses in public: the data sources (and the owner's company), and "fodboldlandshold" (national teams are "<Lands> landshold") */
const FORBIDDEN = /fodboldlandshold|\bDBU\b|API-?Sports|TheSportsDB|SofaScore|Z-15|\|\s*Matchly/i

/** The pages that show James' questions and answers (the club, league and head-to-head pages' FAQ) */
export const FAQ_PATHS = /^\/(klub|turnering|opgoer)\/[a-z0-9-]+$/

/** The pages that show James' text (the club and league pages, src/components/PageStory.tsx) */
export const INTRO_PATHS = /^\/(klub|turnering)\/[a-z0-9-]+$/

const plain = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim()

export function checkOverride(input: { path: string; title?: string; description?: string; faq?: { q: string; a: string }[]; intro?: { heading: string; html: string } }): string | undefined {
  if (!OVERRIDE_PATHS.test(input.path)) return 'Kun klub-, turnerings-, kamp-, artikel-, opgørs- og spillersider'
  const title = input.title?.trim()
  const description = input.description?.trim()
  const faq = input.faq ?? []
  const intro = input.intro
  if (!title && !description && !faq.length && !intro) return 'Giv en titel, en beskrivelse, spørgsmål og svar og/eller en tekst'
  if (title && (title.length < 15 || title.length > 60)) return `Titlen skal være 15–60 tegn (er ${title.length}) – "| Matchly" sættes på af siden selv`
  if (description && (description.length < 70 || description.length > 160)) return `Beskrivelsen skal være 70–160 tegn (er ${description.length})`
  if (faq.length) {
    if (!FAQ_PATHS.test(input.path)) return 'Spørgsmål og svar kun på klub-, liga- og opgørssider'
    if (faq.length > 4) return 'Højst 4 spørgsmål pr. side'
    for (const f of faq) {
      const q = f.q?.trim() ?? ''
      const a = f.a?.trim() ?? ''
      if (q.length < 10 || q.length > 120 || !q.endsWith('?')) return `Spørgsmålet skal være 10–120 tegn og ende med "?": ${q}`
      if (a.length < 20 || a.length > 400) return `Svaret skal være 20–400 tegn: ${q}`
      if (/https?:\/\/|www\./i.test(a)) return 'Ingen links i svarene'
    }
  }
  if (intro) {
    if (!INTRO_PATHS.test(input.path)) return 'Tekst kun på klub- og ligasider'
    const heading = intro.heading?.trim() ?? ''
    const text = plain(intro.html ?? '')
    if (heading.length < 15 || heading.length > 70) return `Tekstens rubrik skal være 15–70 tegn (er ${heading.length})`
    if (text.length < 500 || text.length > 2200) return `Teksten skal være 500–2.200 tegn, ca. 90–350 ord (er ${text.length})`
    if (/<(h[1-6]|img|table|script|iframe)\b/i.test(intro.html)) return 'Kun afsnit (p), fed, kursiv, links og en kort liste (ul/li) i teksten'
    if (/href\s*=\s*["'](?!\/)/i.test(intro.html)) return 'Kun links til Matchlys egne sider (/klub/…, /turnering/…, /kamp/…) i teksten'
  }
  for (const text of [title, description, ...faq.flatMap((f) => [f.q, f.a]), intro?.heading, intro && plain(intro.html)]) if (text && FORBIDDEN.test(text)) return `"${FORBIDDEN.exec(text)?.[0]}" må ikke stå i titler og beskrivelser`
  return undefined
}
