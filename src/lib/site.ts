export const SITE_NAME = 'Scoreline'
export const SITE_URL = (process.env.SITE_URL || 'http://localhost:5173').replace(/\/$/, '')

/**
 * Only allow search engines once the site shows real results. While matches
 * are fictional every page is marked noindex and robots.txt blocks crawling.
 */
export const INDEXABLE = process.env.SITE_INDEXABLE === 'true'

export const paths = {
  about: () => '/om',
  home: (params?: { sport?: string; dato?: string }) => {
    const q = new URLSearchParams()
    if (params?.sport && params.sport !== 'alle') q.set('sport', params.sport)
    if (params?.dato) q.set('dato', params.dato)
    const s = q.toString()
    return s ? `/?${s}` : '/'
  },
  match: (slug: string) => `/kamp/${slug}`,
  club: (slug: string) => `/klub/${slug}`,
  league: (slug: string) => `/turnering/${slug}`,
  clubs: () => '/klubber',
}
