import { slugify } from './slug'

// The editor's SEO checklist (like Yoast): each check is good, ok or bad, with
// a Danish explanation. Worked out in the browser as the article is written.

export interface SeoCheck {
  id: string
  level: 'good' | 'ok' | 'bad'
  text: string
}

interface Input {
  title: string
  slug: string
  content: string
  excerpt: string
  focusKeyword?: string
  seoTitle?: string
  metaDescription?: string
  featuredImage?: string
  featuredAlt?: string
}

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
const fold = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
const count = (hay: string, needle: string) => (needle ? fold(hay).split(fold(needle)).length - 1 : 0)

export function seoChecks(a: Input): SeoCheck[] {
  const out: SeoCheck[] = []
  const add = (id: string, level: SeoCheck['level'], t: string) => out.push({ id, level, text: t })
  const kw = (a.focusKeyword ?? '').trim()
  const body = text(a.content)
  const words = body ? body.split(' ').length : 0
  const seoTitle = (a.seoTitle || a.title).trim()
  const desc = (a.metaDescription || a.excerpt).trim()
  const firstParagraph = text(/<p[^>]*>([\s\S]*?)<\/p>/.exec(a.content)?.[1] ?? '')
  const headings = [...a.content.matchAll(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/g)].map((m) => text(m[1]))
  const links = [...a.content.matchAll(/<a [^>]*href="([^"]*)"/g)].map((m) => m[1])
  const internal = links.filter((h) => h.startsWith('/') || /^https?:\/\/(www\.)?matchly\.dk/.test(h))
  const images = [...a.content.matchAll(/<img [^>]*>/g)].map((m) => m[0])

  if (!kw) add('kw', 'bad', 'Angiv et fokus-søgeord – det ord eller den frase, folk skal finde artiklen på.')
  else {
    add('kw-title', count(seoTitle, kw) ? (fold(seoTitle).startsWith(fold(kw)) ? 'good' : 'ok') : 'bad', count(seoTitle, kw) ? (fold(seoTitle).startsWith(fold(kw)) ? 'Søgeordet står forrest i SEO-titlen.' : 'Søgeordet er i SEO-titlen – gerne tættere på starten.') : 'Søgeordet mangler i SEO-titlen.')
    const kwSlug = slugify(kw)
    add('kw-slug', kwSlug && a.slug.includes(kwSlug) ? 'good' : 'ok', kwSlug && a.slug.includes(kwSlug) ? 'Søgeordet er i permalinket.' : 'Søgeordet er ikke i permalinket.')
    add('kw-desc', count(desc, kw) ? 'good' : 'bad', count(desc, kw) ? 'Søgeordet er i metabeskrivelsen.' : 'Søgeordet mangler i metabeskrivelsen.')
    add('kw-intro', count(firstParagraph, kw) ? 'good' : 'bad', count(firstParagraph, kw) ? 'Søgeordet er i første afsnit.' : 'Brug søgeordet i første afsnit.')
    add('kw-heading', headings.some((h) => count(h, kw)) ? 'good' : 'ok', headings.some((h) => count(h, kw)) ? 'Søgeordet er i en mellemrubrik.' : 'Brug søgeordet i mindst én mellemrubrik (Overskrift 2 eller 3).')
    const density = words ? (count(body, kw) * kw.split(' ').length * 100) / words : 0
    add(
      'kw-density',
      density >= 0.5 && density <= 3 ? 'good' : density > 3 ? 'bad' : 'ok',
      density > 3 ? `Søgeordet fylder ${density.toFixed(1)} % af teksten – det er for meget (højst ca. 3 %).` : `Søgeordet optræder ${count(body, kw)} gange (${density.toFixed(1)} % af teksten; bedst 0,5–3 %).`,
    )
  }
  add('length', words >= 600 ? 'good' : words >= 300 ? 'ok' : 'bad', `${words} ord i teksten – ${words >= 600 ? 'fint' : words >= 300 ? 'gerne 600+ for at ranke på konkurrenceprægede søgninger' : 'mindst 300 ord anbefales'}.`)
  add('seo-title', seoTitle.length > 0 && seoTitle.length <= 60 ? 'good' : seoTitle.length > 60 ? 'ok' : 'bad', seoTitle.length > 60 ? `SEO-titlen er ${seoTitle.length} tegn – Google skærer ved ca. 60.` : seoTitle ? 'SEO-titlen har en god længde.' : 'Skriv en titel.')
  add('desc', desc.length >= 120 && desc.length <= 160 ? 'good' : desc.length ? 'ok' : 'bad', desc.length ? `Metabeskrivelsen er ${desc.length} tegn (bedst 120–160).` : 'Skriv en metabeskrivelse eller et uddrag.')
  add('headings', headings.length ? 'good' : 'ok', headings.length ? `${headings.length} mellemrubrikker gør teksten let at skimme.` : 'Del teksten op med mellemrubrikker.')
  add('internal', internal.length ? 'good' : 'ok', internal.length ? `${internal.length} interne links (fx til klub-, kamp- og turneringssider).` : 'Link til mindst én side på Matchly (klub, kamp eller turnering).')
  add('image', a.featuredImage ? (a.featuredAlt?.trim() ? 'good' : 'ok') : 'bad', a.featuredImage ? (a.featuredAlt?.trim() ? 'Udvalgt billede med alt-tekst.' : 'Giv det udvalgte billede en alt-tekst.') : 'Vælg et udvalgt billede – det vises i delinger og på Google.')
  if (images.length) {
    const missing = images.filter((i) => !/alt="[^"]+"/.test(i)).length
    add('alts', missing ? 'ok' : 'good', missing ? `${missing} billeder i teksten mangler alt-tekst.` : 'Alle billeder i teksten har alt-tekst.')
  }
  return out
}
