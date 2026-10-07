// The result put at the top of a preview once the match is played (src/lib/previewResults.ts). Pure (tests).

/** The match a preview is about: its first link to a match page, /kamp/<slug ending in the date> */
export function previewMatchSlug(content: string): string | undefined {
  return /href="\/kamp\/([a-z0-9-]+-\d{4}-\d{2}-\d{2})"/.exec(content)?.[1]
}

const MARK = '<p><strong>Kampen er spillet:'

export const hasResult = (content: string) => content.startsWith(MARK)

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** The preview with the result first: who won, the score, and the way to the match page */
export function withResult(content: string, r: { slug: string; home: string; away: string; hs: number; as: number }): string {
  if (hasResult(content)) return content
  const line = `${MARK} ${esc(r.home)} – ${esc(r.away)} ${r.hs}-${r.as}.</strong> Se målene, kortene og statistikken på <a href="/kamp/${r.slug}">kampsiden</a>. Optakten herunder er skrevet før kampen.</p>`
  return line + content
}
