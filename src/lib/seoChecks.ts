import { slugify } from './slug.ts'

// The editor's SEO checklist (like Yoast): each check is good, ok or bad, with
// a Danish explanation. Worked out in the browser as the article is written.
// Two groups: SEO (search words, title, links) and "Læsbarhed" – whether the
// text reads like a person wrote it (sentence length, stiff stock phrases,
// sources, paragraphs), which is also what Google rewards as
// helpful content written from real knowledge.

export interface SeoCheck {
  id: string
  level: 'good' | 'ok' | 'bad'
  text: string
  group: 'seo' | 'read'
}

/** Stock phrases that make a text read like a template or a machine; each is fine once in a while, many is not */
export const STIFF_PHRASES = [
  'det er værd at bemærke',
  'værd at nævne',
  'i en verden',
  'ikke kun',
  'når alt kommer til alt',
  'i sidste ende',
  'dykke ned i',
  'dykker ned i',
  'kan ikke undervurderes',
  'uden tvivl',
  'summa summarum',
  'med andre ord',
  'på mange måder',
  'et vidnesbyrd om',
  'spændende kamp',
  'spændende opgør',
  'byder på',
  'lover godt',
  'alt er muligt',
  'tid vil vise',
  'det bliver spændende',
  'fremadrettet',
  'i bund og grund',
  'kort sagt',
  'afslutningsvis',
]

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
  const add = (id: string, level: SeoCheck['level'], t: string, group: SeoCheck['group'] = 'seo') => out.push({ id, level, text: t, group })
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
  add(
    'internal',
    internal.length >= 3 ? 'good' : 'ok',
    internal.length >= 3 ? `${internal.length} interne links (fx til klub-, kamp- og turneringssider).` : `${internal.length} interne links – link til mindst 3 sider på Matchly (klubberne, kampen, turneringen).`,
  )
  const questions = headings.filter((h) => h.trim().endsWith('?'))
  add(
    'questions',
    questions.length >= 2 ? 'good' : 'ok',
    questions.length >= 2 ? `${questions.length} mellemrubrikker er spørgsmål – det er dem, Google og AI-svar citerer.` : 'Skriv 2–4 mellemrubrikker som spørgsmål, folk søger på (fx "Hvor kan jeg se kampen i TV?"), med svaret i første sætning.',
  )
  add('image', a.featuredImage ? (a.featuredAlt?.trim() ? 'good' : 'ok') : 'bad', a.featuredImage ? (a.featuredAlt?.trim() ? 'Udvalgt billede med alt-tekst.' : 'Giv det udvalgte billede en alt-tekst.') : 'Vælg et udvalgt billede – det vises i delinger og på Google.')
  if (images.length) {
    const missing = images.filter((i) => !/alt="[^"]+"/.test(i)).length
    add('alts', missing ? 'ok' : 'good', missing ? `${missing} billeder i teksten mangler alt-tekst.` : 'Alle billeder i teksten har alt-tekst.')
  }

  // Læsbarhed: does it read like a person wrote it?
  const paragraphs = [...a.content.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => text(m[1])).filter(Boolean)
  const sentences = paragraphs.flatMap((p) => p.split(/(?<=[.!?])\s+(?=[A-ZÆØÅ"„«])/)).filter((x) => x.split(' ').length >= 3)
  if (sentences.length >= 5) {
    const long = sentences.filter((x) => x.split(' ').length > 25).length
    const share = long / sentences.length
    add(
      'sentences',
      share <= 0.15 ? 'good' : share <= 0.3 ? 'ok' : 'bad',
      share <= 0.15 ? 'Sætningerne har en god længde.' : `${long} af ${sentences.length} sætninger er over 25 ord – del dem op, så teksten er let at læse.`,
      'read',
    )
    const firsts = sentences.map((x) => fold(x.split(' ')[0].replace(/[^\p{L}\d]/gu, '')))
    let run = 1
    let worst = 1
    let word = ''
    for (let i = 1; i < firsts.length; i++) {
      run = firsts[i] && firsts[i] === firsts[i - 1] ? run + 1 : 1
      if (run > worst) ((worst = run), (word = sentences[i].split(' ')[0]))
    }
    add('openers', worst >= 3 ? 'ok' : 'good', worst >= 3 ? `${worst} sætninger i træk begynder med "${word}" – varier starten.` : 'Sætningerne begynder forskelligt.', 'read')
  }
  const stiff = STIFF_PHRASES.filter((p) => count(body, p))
  add(
    'phrases',
    stiff.length === 0 ? 'good' : stiff.length <= 2 ? 'ok' : 'bad',
    stiff.length ? `Stive vendinger: ${stiff.map((p) => `"${p}"`).join(', ')} – skriv det, som du ville sige det.` : 'Ingen stive standardvendinger.',
    'read',
  )
  const longParagraphs = paragraphs.filter((p) => p.split(' ').length > 90).length
  add('paragraphs', longParagraphs ? 'ok' : 'good', longParagraphs ? `${longParagraphs} afsnit er over 90 ord – korte afsnit læses bedre på mobilen.` : 'Afsnittene er korte nok til mobilen.', 'read')
  const external = links.filter((h) => /^https?:\/\//.test(h) && !/^https?:\/\/(www\.)?matchly\.dk/.test(h))
  add(
    'sources',
    external.length ? 'good' : 'ok',
    external.length ? `${external.length} links til kilder uden for Matchly.` : 'Link til dine kilder (klubbens side, DBU, lokalavisen) – det viser læseren og Google, hvor fakta kommer fra.',
    'read',
  )
  return out
}
