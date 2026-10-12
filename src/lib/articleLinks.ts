// An internal link James adds to one of his own articles (his growth round, deploy/claude-editor/VAEKST.md): the
// first time the words stand in the text – not in a heading, not inside a link already – become a link to the page
// he is lifting, with the search itself as the link's words. Pure (tests/data/articleLinks.test.ts).

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function addInternalLink(html: string, words: string, href: string): { html?: string; error?: string } {
  const text = words.trim()
  if (text.length < 3 || text.length > 80) return { error: 'Linkets ord skal være 3–80 tegn' }
  if (!/^\/(klub|turnering|opgoer|spiller|kamp|artikler|tv|danskere-i-udlandet)(\/[a-z0-9-]+)*$/.test(href)) return { error: 'Kun links til Matchlys egne sider (/klub/…, /turnering/…, /opgoer/…, /spiller/…)' }
  if (new RegExp(`href=["']${escape(href)}["']`).test(html)) return { error: 'Artiklen linker allerede til siden' }
  // The text in pieces: links and headings whole (left alone), other tags, and the plain text between them
  const parts = html.split(/(<a\b[\s\S]*?<\/a>|<h[1-6]\b[\s\S]*?<\/h[1-6]>|<[^>]+>)/i)
  const find = new RegExp(`(^|[^\\p{L}\\p{N}])(${escape(text)})(?=$|[^\\p{L}\\p{N}])`, 'iu')
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].startsWith('<')) continue
    const m = find.exec(parts[i])
    if (!m) continue
    const at = m.index + m[1].length
    parts[i] = `${parts[i].slice(0, at)}<a href="${href}">${m[2]}</a>${parts[i].slice(at + m[2].length)}`
    return { html: parts.join('') }
  }
  return { error: `"${text}" står ikke i artiklens tekst (uden for links og mellemrubrikker)` }
}
