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
  /** Advertising on Matchly: the formats, the audience and a form for advertisers */
  advertising: () => '/annoncering',
  privacy: () => '/privatliv',
  /** A day's matches: today on the front page, yesterday and tomorrow under their names, other days by date */
  home: (params?: { sport?: string; dato?: string; today?: string }) => {
    const q = new URLSearchParams()
    if (params?.sport && params.sport !== 'alle') q.set('sport', params.sport)
    const s = q.toString() ? `?${q}` : ''
    const day = params?.dato && dayAlias(params.dato, params.today)
    return day ? `/kampe/${day}${s}` : `/${s}`
  },
  /** Women's sport (every sport, or one: football has its own address), today or another day (?dato=) */
  women: (params?: { sport?: string; dato?: string; today?: string; live?: boolean }) => {
    const q = new URLSearchParams()
    if (params?.dato && params.dato !== params.today) q.set('dato', params.dato)
    if (params?.live) q.set('live', '1')
    const sport = params?.sport
    const base = sport === 'soccer' || sport === 'fodbold' ? '/kvindefodbold' : !sport || sport === 'all' || sport === 'alle' ? '/kvindesport' : `/kvindesport/${sport}`
    return `${base}${q.toString() ? `?${q}` : ''}`
  },
  match: (slug: string) => `/kamp/${slug}`,
  club: (slug: string) => `/klub/${slug}`,
  league: (slug: string) => `/turnering/${slug}`,
  clubs: () => '/klubber',
  /** The TV guide: today's matches on TV, or one league's coming matches on TV */
  tv: (league?: string) => (league ? `/tv/${league}` : '/tv'),
  articles: (page?: number) => (page && page > 1 ? `/artikler?side=${page}` : '/artikler'),
  article: (slug: string) => `/artikler/${slug}`,
  articleCategory: (slug: string) => `/artikler/kategori/${slug}`,
  articleTag: (slug: string) => `/artikler/tag/${slug}`,
}
