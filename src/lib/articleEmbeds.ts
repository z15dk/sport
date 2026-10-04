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
