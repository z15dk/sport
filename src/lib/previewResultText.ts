// The result put at the top of a preview once the match is played (src/lib/previewResults.ts). Pure (tests).

/** The match a preview is about: its first link to a match page, /kamp/<slug ending in the date> */
export function previewMatchSlug(content: string): string | undefined {
  return /href="\/kamp\/([a-z0-9-]+-\d{4}-\d{2}-\d{2})"/.exec(content)?.[1]
}

/** A round-up of a day's matches (several match links on the same day as the first) is no preview of one match */
export function isRoundUp(content: string): boolean {
  const slugs = new Set([...content.matchAll(/href="\/kamp\/([a-z0-9-]+-(\d{4}-\d{2}-\d{2}))"/g)].map((m) => m[1]))
  const first = previewMatchSlug(content)
  const day = first?.slice(-10)
  return [...slugs].filter((x) => x.endsWith(day ?? '-')).length > 1
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

/** The text without the result line (for a round-up that got one by mistake) */
export function withoutResult(content: string): string {
  if (!hasResult(content)) return content
  const end = content.indexOf('</p>')
  return end < 0 ? content : content.slice(end + 4)
}
