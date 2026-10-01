import 'server-only'

// What the embeddable widgets (/widget/tabel, /widget/kampe) share: escaping,
// badge letters, the chosen colour, our fonts and colours, the Matchly bar at
// the bottom and the script that tells the host page the widget's height.

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** "FC København" -> "FK", "AGF" -> "AGF": the letters on a badge without a logo */
export const initials = (name: string) => {
  const words = name.split(/\s+/).filter((w) => /^[\p{L}]/u.test(w) && !/^(fc|fk|bk|if|ik|ff|sv|sc|vfb|vfl)$/i.test(w))
  return (words.length > 1 ? words.slice(0, 2).map((w) => w[0]).join('') : (words[0] ?? name).slice(0, 3)).toUpperCase()
}

/** The colour chosen in /widget (?farve=1d4ed8, else our lime) and a text colour that stays readable on it */
export function accent(param: string | null): { color: string; ink: string } {
  const color = /^[0-9a-f]{6}$/i.test(param ?? '') ? `#${param!.toLowerCase()}` : '#c6f135'
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return { color, ink: 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.35 ? '#111' : '#fff' }
}

/** Fonts, colours (light or dark), the card and the Matchly bar */
export function baseCss(dark: boolean, a: { color: string; ink: string }) {
  return `@font-face{font-family:"Barlow Condensed";font-style:italic;font-weight:800;font-display:swap;src:url(/widget-fonts/barlow-condensed-800-italic.woff2) format("woff2")}
@font-face{font-family:"DM Sans";font-style:normal;font-weight:100 1000;font-display:swap;src:url(/widget-fonts/dm-sans.woff2) format("woff2")}
:root{--me:${a.color};--me-ink:${a.ink};--surface:#fff;--row:#f4f5f0;--ink:#0f110c;--ink2:#5a5f55;--ink3:#676c60;--line:#e1e4da;--lime:#c6f135;--deep:#6f8f00;--live:#ff4a1f;--d:"Barlow Condensed","Arial Narrow",sans-serif}
${dark ? ':root{--surface:#15170f;--row:#1f2219;--ink:#f3f5ee;--ink2:#b9bdb0;--ink3:#9ea393;--line:#2a2d22;--deep:#a5d000}.bar{border-top:1px solid #2f3326}' : ''}
*{box-sizing:border-box}html,body{margin:0;background:transparent;color:var(--ink);font:14px/1.4 "DM Sans",system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
.w{background:var(--surface);border-radius:22px;overflow:hidden}
.h{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:18px 18px 8px}
.h h1{margin:0;font:italic 800 22px/1 var(--d);text-transform:uppercase}
.h span{font-size:12px;color:var(--ink3)}
img,.ini{width:24px;height:24px;flex:none;object-fit:contain}
.ini{display:inline-flex;align-items:center;justify-content:center;border-radius:50%;font-size:8px;font-weight:800}
.bar{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 18px;background:#0f110c;color:#fff;text-decoration:none}
.logo{font:italic 800 24px/1 var(--d);text-transform:uppercase;letter-spacing:-.01em}.logo i{color:var(--live);font-style:inherit}
.tag{font-size:12px;color:#b9bdb0;text-align:right}.bar:hover .tag{color:var(--lime)}`
}

/**
 * The Matchly bar at the bottom, a link to the page the widget comes from. On another
 * site (?credit=1) its right side is left empty: public/widget.js lays the host page's
 * own link to us (the backlink) over it, so it shows inside the bar, not under the widget.
 */
export const matchlyBar = (href: string, url?: URL) =>
  `<a class="bar" href="${href}" target="_blank" rel="noopener"><span class="logo">Matchly<i>.</i></span>${url?.searchParams.get('credit') === '1' ? '' : '<span class="tag">Live score og stats · matchly.dk</span>'}</a>`

/** Tells the host page (public/widget.js) the widget's height, now and when it changes */
export const heightScript = (id: string) =>
  `<script>(function(){function s(){parent.postMessage({matchly:${JSON.stringify(id)},height:document.body.getBoundingClientRect().height},"*")}addEventListener("load",s);new ResizeObserver(s).observe(document.body);s();setTimeout(s,700);setTimeout(s,2000)})()</script>`

/** The headers every widget answers with: any site may show it, search engines leave it, a browser keeps it five minutes */
export const widgetHeaders = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
  'X-Robots-Tag': 'noindex',
  'Content-Security-Policy': 'frame-ancestors *',
}
