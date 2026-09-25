// Danish and German letters as they are usually written in URLs
const MAP: Record<string, string> = { æ: 'ae', ø: 'oe', å: 'aa', é: 'e', ü: 'ue', ö: 'oe', ä: 'ae', ß: 'ss' }

/** "FC København" -> "fc-koebenhavn" */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[æøåéüöäß]/g, (ch) => MAP[ch])
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, '-og-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function matchSlug(home: string, away: string, date: string) {
  return `${slugify(home)}-${slugify(away)}-${date}`
}

/** Pulls the YYYY-MM-DD date off the end of a match slug */
export function dateFromMatchSlug(slug: string) {
  const m = slug.match(/(\d{4}-\d{2}-\d{2})$/)
  return m?.[1]
}
