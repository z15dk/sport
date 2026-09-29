import 'server-only'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { cacheDir } from './tsdb'

// The women's sport pages' top (src/components/WomenLanding.tsx), set in
// /admin/kvindesport: its picture (an upload, /uploads/<hash>.webp), which part
// of it to show, and the heading's two lines and the text under it.
// Kept in /opt/scoreline/data/women-page.json (or WOMEN_PAGE_FILE).

export const HERO_POSITIONS = ['top', 'center', 'bottom'] as const
export type HeroPosition = (typeof HERO_POSITIONS)[number]

export interface WomenPage {
  image?: string
  position: HeroPosition
  title1: string
  title2: string
  /** Empty: the page's own text for the sport */
  lead: string
  updatedAt?: number
}

export const WOMEN_PAGE_DEFAULT: WomenPage = { position: 'center', title1: 'Hun spiller.', title2: 'Vi følger med.', lead: '' }

const file = () => process.env.WOMEN_PAGE_FILE ?? path.join(/*turbopackIgnore: true*/ cacheDir(), 'data', 'women-page.json')

export function womenPage(): WomenPage {
  try {
    return { ...WOMEN_PAGE_DEFAULT, ...(JSON.parse(readFileSync(file(), 'utf8')) as Partial<WomenPage>) }
  } catch {
    return WOMEN_PAGE_DEFAULT
  }
}

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined)

export function saveWomenPage(input: Record<string, unknown>): WomenPage {
  const c = womenPage()
  const image = input.image === null || input.image === '' ? undefined : typeof input.image === 'string' && /^\/uploads\/[a-f0-9]{24}\.webp$/.test(input.image) ? input.image : c.image
  const next: WomenPage = {
    image,
    position: HERO_POSITIONS.includes(input.position as HeroPosition) ? (input.position as HeroPosition) : c.position,
    title1: text(input.title1, 40) || c.title1,
    title2: text(input.title2, 40) ?? c.title2,
    lead: text(input.lead, 300) ?? c.lead,
    updatedAt: Date.now(),
  }
  mkdirSync(path.dirname(file()), { recursive: true })
  writeFileSync(file(), JSON.stringify(next, null, 2))
  return next
}
