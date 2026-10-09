import 'server-only'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Metadata } from 'next'
import { checkOverride } from './seoOverrideRules'
import { cacheDir } from './tsdb'

// Titles and descriptions James sets on pages close to Google's page 1 (his daily growth round,
// src/lib/jamesGrowth.ts): kept as data (data/seo-overrides.json), so they need no release, each with why, which
// search it is for and the page's Google numbers when it was set – after 14 days James holds them up against the
// numbers since and keeps or undoes it. At most 5 new a day, and a page is left alone for 14 days after a change.
// The pages apply them in their generateMetadata (withSeoOverride).

export const DAILY_TITLES = 5
export const LOCK_DAYS = 14

export interface SeoBaseline {
  position: number
  ctr: number
  impressions: number
  clicks: number
}

export interface SeoOverride {
  title?: string
  description?: string
  /** Questions and answers added to the page's FAQ (club, league and head-to-head pages) */
  faq?: { q: string; a: string }[]
  /** The search the change is for */
  query?: string
  why: string
  by: string
  at: number
  /** The page's Google numbers (last 28 days) when it was set */
  before?: SeoBaseline
  /** Set when James has judged it after 14 days and kept it */
  kept?: { at: number; why: string }
}

export interface SeoLogLine {
  at: number
  by: string
  path: string
  text: string
}

interface Store {
  pages: Record<string, SeoOverride>
  log: SeoLogLine[]
}

const file = () => path.join(/*turbopackIgnore: true*/ cacheDir(), 'data', 'seo-overrides.json')
let cache: { at: number; store: Store } | undefined

export function readSeoOverrides(): Store {
  if (cache && Date.now() - cache.at < 30_000) return cache.store
  let store: Store
  try {
    const s = JSON.parse(readFileSync(file(), 'utf8')) as Partial<Store>
    store = { pages: s.pages ?? {}, log: s.log ?? [] }
  } catch {
    store = { pages: {}, log: [] }
  }
  cache = { at: Date.now(), store }
  return store
}

function save(store: Store) {
  mkdirSync(path.dirname(file()), { recursive: true })
  store.log = store.log.slice(-300)
  writeFileSync(file(), JSON.stringify(store, null, 2))
  cache = { at: Date.now(), store }
}

/** The page's own metadata with James' title and description, when he has set one */
export function withSeoOverride(pagePath: string, meta: Metadata): Metadata {
  const o = readSeoOverrides().pages[pagePath]
  if (!o) return meta
  return {
    ...meta,
    ...(o.title && { title: { absolute: `${o.title} | Matchly` } }),
    ...(o.description && { description: o.description }),
    openGraph: { ...meta.openGraph, ...(o.title && { title: o.title }), ...(o.description && { description: o.description }) },
  }
}

/** The page's FAQ with James' questions first (a question of the page's own that he answers again is left out) */
export function withSeoFaq<T extends { q: string; a: string }>(pagePath: string, items: T[]): { q: string; a: string }[] {
  const extra = readSeoOverrides().pages[pagePath]?.faq
  if (!extra?.length) return items
  const same = new Set(extra.map((f) => f.q.toLowerCase()))
  return [...extra, ...items.filter((f) => !same.has(f.q.toLowerCase()))]
}

const danishDay = (ms: number) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Copenhagen' }).format(new Date(ms))

/** New titles set today (Danish day) */
export function setToday(store = readSeoOverrides(), now = Date.now()) {
  return store.log.filter((l) => l.text.startsWith('Ny titel') && danishDay(l.at) === danishDay(now)).length
}

export function setSeoOverride(input: { path: string; title?: string; description?: string; faq?: { q: string; a: string }[]; query?: string; why: string }, by: string, before?: SeoBaseline): { error?: string } {
  const bad = checkOverride(input)
  if (bad) return { error: bad }
  if (!input.why?.trim()) return { error: 'Skriv hvorfor (fx søgningen og placeringen)' }
  const store = readSeoOverrides()
  const now = Date.now()
  const old = store.pages[input.path]
  if (old && now - old.at < LOCK_DAYS * 86_400_000) return { error: `Siden blev ændret ${danishDay(old.at)} – vent ${LOCK_DAYS} dage, så tallene kan måles` }
  if (setToday(store, now) >= DAILY_TITLES) return { error: `Der er sat ${DAILY_TITLES} nye titler i dag – resten i morgen` }
  const faq = input.faq?.map((f) => ({ q: f.q.trim(), a: f.a.trim() }))
  store.pages[input.path] = { title: input.title?.trim(), description: input.description?.trim(), faq: faq?.length ? faq : undefined, query: input.query?.trim(), why: input.why.trim().slice(0, 400), by, at: now, before }
  store.log.push({ at: now, by, path: input.path, text: `Ny titel${input.title ? `: "${input.title.trim()}"` : ''}${input.description ? ' + beskrivelse' : ''}${faq?.length ? ` + ${faq.length} spørgsmål` : ''}${input.query ? ` (søgning: ${input.query.trim()})` : ''}` })
  save(store)
  return {}
}

/** After the 14 days: keep it (with what the numbers showed) or undo it (the page's own title again) */
export function judgeSeoOverride(pagePath: string, verdict: 'behold' | 'fortryd', why: string, by: string): { error?: string } {
  const store = readSeoOverrides()
  const o = store.pages[pagePath]
  if (!o) return { error: 'Siden har ingen titel fra James' }
  if (!why?.trim()) return { error: 'Skriv hvad tallene viste' }
  const now = Date.now()
  if (verdict === 'fortryd') delete store.pages[pagePath]
  else o.kept = { at: now, why: why.trim().slice(0, 400) }
  store.log.push({ at: now, by, path: pagePath, text: `${verdict === 'fortryd' ? 'Fortrudt' : 'Beholdt'}: ${why.trim().slice(0, 300)}` })
  save(store)
  return {}
}
