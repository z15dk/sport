export const SITE_NAME = 'Matchly'
export const SITE_URL = (process.env.SITE_URL || 'http://localhost:5173').replace(/\/$/, '')


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
  articles: (page?: number) => (page && page > 1 ? `/artikler?side=${page}` : '/artikler'),
  article: (slug: string) => `/artikler/${slug}`,
  articleCategory: (slug: string) => `/artikler/kategori/${slug}`,
  articleTag: (slug: string) => `/artikler/tag/${slug}`,
}
