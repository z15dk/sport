// Article text after it has been cleaned (cleanHtml): our own widgets put in with a short code,
// and the tables given the site's design.
//
// [tabel liga="3-division" hold="broenshoej-bk,bk-frem"] alone in a paragraph becomes the live
// league table widget (public/widget.js) with those clubs highlighted; `kompakt="1"` hides the
// extra columns. Table cells that are only numbers or scores ("9", "1-1", "24-17", "42 %", "7 (2)") get
// class "num", column by column (not the first, which names the row), so they stand centred while
// names and text stay to the left, and each table sits in a box that scrolls sideways on a phone.

// Also when the editor has turned the quotes into typographic ones („…“, “…”) or put a space or a style round it
const SHORTCODE = /<p[^>]*>(?:\s|&nbsp;|<\/?(?:span|strong|em)[^>]*>)*\[tabel\s+([^\]]*)\](?:\s|&nbsp;|<\/?(?:span|strong|em)[^>]*>)*<\/p>/g
const ATTR = /(\w+)="([^"]*)"/g
/** Straight quotes and plain spaces, whatever the editor made of them */
const plainAttrs = (s: string) =>
  s
    .replace(/&quot;|&#34;|&#x22;|&ldquo;|&rdquo;|&bdquo;|&#8220;|&#8221;|&#8222;|[“”„‟″«»]/g, '"')
    .replace(/&nbsp;|\u00a0/g, ' ')
    .replace(/<[^>]+>/g, '')
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)
const slugLike = (s: string) => s.toLowerCase().replace(/[^a-z0-9,-]/g, '')

/** The league table widgets the text asks for; `used` tells the page to load widget.js */
export function expandWidgets(html: string): { html: string; used: boolean } {
  let used = false
  const out = html.replace(SHORTCODE, (whole, attrs: string) => {
    const a: Record<string, string> = {}
    for (const m of plainAttrs(attrs).matchAll(ATTR)) a[m[1]] = m[2]
    const liga = slugLike(a.liga ?? '')
    if (!liga) return whole
    used = true
    const data = [`data-liga="${liga}"`, a.hold && `data-hold="${slugLike(a.hold)}"`, a.kompakt === '1' && 'data-kompakt="1"'].filter(Boolean).join(' ')
    return `<div class="matchly-tabel article-widget" ${data}><a href="/turnering/${liga}">${esc(a.titel ?? 'Stillingen')}</a></div>`
  })
  return { html: out, used }
}

const NUMERIC = /^[\d\s.,:%+–−()-]+$/
const text = (cell: string) => cell.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim()

/** Marks the columns that hold only numbers, so they can be centred */
export function markNumberColumns(html: string): string {
  return html.replace(/<table>([\s\S]*?)<\/table>/g, (_whole, inner: string) => {
    const rows = [...inner.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((r) => [...r[1].matchAll(/<(td|th)([^>]*)>([\s\S]*?)<\/\1>/g)])
    const numeric: boolean[] = []
    for (const cells of rows)
      cells.forEach((c, i) => {
        if (c[1] !== 'td') return
        const t = text(c[3])
        if (!t) return
        numeric[i] = (numeric[i] ?? true) && NUMERIC.test(t)
      })
    // The first column names the row (a date, a team) and stays to the left
    numeric[0] = false
    const marked = inner.replace(/<tr>([\s\S]*?)<\/tr>/g, (_row, cells: string) => {
      let i = 0
      return `<tr>${cells.replace(/<(td|th)([^>]*)>/g, (tag, name: string, rest: string) => (numeric[i++] ? `<${name}${rest} class="num">` : tag))}</tr>`
    })
    // In its own box that scrolls sideways, so a wide table never pushes the page wider on a phone
    return `<div class="table-scroll"><table>${marked}</table></div>`
  })
}

// ---------------------------------------------------------------- the questions at the end

/** The heading that starts an article's questions ("Ofte stillede spørgsmål …", "FAQ") */
const FAQ_HEADING = /<h2([^>]*)>((?:(?!<\/h2>)[\s\S])*?(?:spørgsmål|faq|ofte stillede)(?:(?!<\/h2>)[\s\S])*?)<\/h2>/i
/** A closing paragraph all in italics (where the article's sources and last update are told) */
const SOURCE_NOTE = /<p[^>]*>\s*<em>((?:(?!<\/p>)[\s\S])*)<\/em>\s*<\/p>\s*$/i

/** The article's questions and answers (h3 + what follows it), and the closing note after them if there is one */
export function articleFaq(html: string): { before: string; title: string; items: { q: string; a: string }[]; note?: string; after: string } | undefined {
  const start = FAQ_HEADING.exec(html)
  if (!start) return undefined
  const rest = html.slice(start.index + start[0].length)
  const next = rest.search(/<h2[\s>]/i)
  let section = next < 0 ? rest : rest.slice(0, next)
  const after = next < 0 ? '' : rest.slice(next)
  const note = SOURCE_NOTE.exec(section)
  if (note) section = section.slice(0, note.index)
  const items = [...section.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>([\s\S]*?)(?=<h3[\s>]|$)/gi)].map((m) => ({ q: m[1].trim(), a: m[2].trim() })).filter((x) => text(x.q) && text(x.a))
  if (!items.length) return undefined
  return { before: html.slice(0, start.index), title: start[2].trim(), items, note: note?.[1].trim(), after }
}

/**
 * The questions at the end of an article as their own dark box: each question a numbered row that
 * opens to its answer (the first open), and the sources under it as a quiet note. The saved text is
 * untouched; it is drawn this way when the article is shown.
 */
export function styleFaq(html: string): string {
  const faq = articleFaq(html)
  if (!faq) return html
  const rows = faq.items
    .map(
      (it, i) =>
        `<details class="art-faq__item"${i === 0 ? ' open' : ''}><summary><span class="art-faq__n">${String(i + 1).padStart(2, '0')}</span><span class="art-faq__q">${it.q}</span><span class="art-faq__icon" aria-hidden="true"></span></summary><div class="art-faq__a">${it.a}</div></details>`,
    )
    .join('')
  const note = faq.note ? `<p class="art-source">${faq.note}</p>` : ''
  return `${faq.before}<section class="art-faq" aria-labelledby="ofte-stillede-spoergsmaal"><span class="art-faq__m" aria-hidden="true">M</span><p class="art-faq__kicker"><span class="art-faq__logo">Matchly<span class="logo__dot">.</span></span><span>Spørgsmål og svar</span></p><h2 id="ofte-stillede-spoergsmaal">${faq.title}</h2><div class="art-faq__list">${rows}</div><p class="art-faq__foot">Svarene er skrevet af Matchly<span class="logo__dot">.</span></p></section>${note}${faq.after}`
}

/**
 * The result a preview gets once the match is played ("Kampen er spillet: A – B 1-1." first in the text,
 * src/lib/previewResults.ts) drawn in the look of the questions box (styleFaq): the dark green ground with
 * Matchly's outlined M, the kicker with the way to the match page beside it, and the two clubs with the score big
 * between them – as low as a plain result line allows. The saved text is untouched.
 */
export function styleResult(html: string): string {
  const m = /^<p><strong>Kampen er spillet: (.+?) – (.+?) (\d+)-(\d+)\.<\/strong>\s*([\s\S]*?)<\/p>/.exec(html)
  if (!m) return html
  const [whole, home, away, hs, as, rest] = m
  const href = /href="(\/kamp\/[^"]+)"/.exec(rest)?.[1]
  const link = href ? `<a class="art-result__link" href="${href}">Se stats <span aria-hidden="true">→</span></a>` : ''
  return `<aside class="art-result" aria-label="Resultat"><span class="art-faq__m" aria-hidden="true">M</span><div class="art-result__top"><p class="art-faq__kicker"><span class="art-faq__logo">Matchly<span class="logo__dot">.</span></span><span>Kampen er spillet</span></p>${link}</div><div class="art-result__score"><span class="art-result__team">${home}</span><strong>${hs}<span class="art-result__dash">–</span>${as}</strong><span class="art-result__team">${away}</span></div><p class="art-result__foot">Optakten herunder er skrevet før kampen</p></aside>${html.slice(whole.length)}`
}
