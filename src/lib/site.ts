import { addDays } from './time'
export const SITE_NAME = 'Matchly'
export const SITE_URL = (process.env.SITE_URL || 'http://localhost:5173').replace(/\/$/, '')


/** How a day is written in its address: "i-gaar", "i-morgen", a date, or nothing for today */
export function dayAlias(date: string, today?: string): string | undefined {
  if (!today) return date
  if (date === today) return undefined
  return date === addDays(today, -1) ? 'i-gaar' : date === addDays(today, 1) ? 'i-morgen' : date
}

export const paths = {
  about: () => '/om',
  /** A day's matches: today on the front page, yesterday and tomorrow under their names, other days by date */
  home: (params?: { sport?: string; dato?: string; today?: string }) => {
    const q = new URLSearchParams()
    if (params?.sport && params.sport !== 'alle') q.set('sport', params.sport)
    const s = q.toString() ? `?${q}` : ''
    const day = params?.dato && dayAlias(params.dato, params.today)
    return day ? `/kampe/${day}${s}` : `/${s}`
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
