import 'server-only'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import sanitizeHtml from 'sanitize-html'
import { slugify } from './slug'
import { cacheDir } from './tsdb'

// Matchly's own articles (for organic search traffic), written in the admin
// editor (/admin/artikler). Kept in SQLite beside the statistics bank
// (/opt/scoreline/data/articles.db, or ARTICLES_DB), so they survive deploys.

export type ArticleStatus = 'draft' | 'published'

export interface Article {
  id: number
  slug: string
  title: string
  excerpt: string
  /** Sanitised HTML from the editor */
  content: string
  featuredImage?: string
  featuredAlt?: string
  category?: string
  tags: string[]
  focusKeyword?: string
  seoTitle?: string
  metaDescription?: string
  author: string
  status: ArticleStatus
  /** ISO time; a published article with a later time is scheduled */
  publishedAt?: string
  /** Not shared on social media when it goes live */
  noSocial: boolean
  updatedAt: string
  createdAt: string
}

export interface Category {
  slug: string
  name: string
}

export type ArticleInput = Partial<Omit<Article, 'id' | 'createdAt' | 'updatedAt'>> & { id?: number }

type Row = Record<string, unknown>
interface Stmt {
  run(...params: unknown[]): { lastInsertRowid?: number | bigint; changes?: number | bigint }
  all(...params: unknown[]): Row[]
  get(...params: unknown[]): Row | undefined
}
interface Db {
  exec(sql: string): void
  prepare(sql: string): Stmt
  close(): void
}
type Sqlite = { DatabaseSync: new (file: string, opts?: { readOnly?: boolean }) => Db }
const sqlite = () => process.getBuiltinModule?.('node:sqlite') as Sqlite | undefined

const file = () => process.env.ARTICLES_DB ?? path.join(/*turbopackIgnore: true*/ cacheDir(), 'data', 'articles.db')

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    excerpt TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    featured_image TEXT,
    featured_alt TEXT,
    category TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    focus_keyword TEXT,
    seo_title TEXT,
    meta_description TEXT,
    author TEXT NOT NULL DEFAULT 'Matchly',
    status TEXT NOT NULL DEFAULT 'draft',
    published_at TEXT,
    updated_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS articles_published ON articles (status, published_at);
  CREATE TABLE IF NOT EXISTS categories (
    slug TEXT PRIMARY KEY,
    name TEXT NOT NULL
  );
`

// Columns added after the table was first made
let migrated = false
function migrate(db: Db) {
  if (migrated) return
  const cols = new Set(db.prepare('PRAGMA table_info(articles)').all().map((r) => String(r.name)))
  if (!cols.has('no_social')) db.exec('ALTER TABLE articles ADD COLUMN no_social INTEGER NOT NULL DEFAULT 0')
  migrated = true
}

function open<T>(fn: (db: Db) => T, fallback: T): T {
  const lib = sqlite()
  if (!lib) return fallback
  mkdirSync(path.dirname(file()), { recursive: true })
  const db = new lib.DatabaseSync(file())
  try {
    db.exec('PRAGMA busy_timeout = 5000')
    db.exec(SCHEMA)
    migrate(db)
    return fn(db)
  } finally {
    db.close()
  }
}

const str = (v: unknown) => (v === null || v === undefined ? undefined : String(v))

function toArticle(r: Row): Article {
  let tags: string[] = []
  try {
    tags = JSON.parse(String(r.tags ?? '[]'))
  } catch {
    // Old or broken value: no tags
  }
  return {
    id: Number(r.id),
    slug: String(r.slug),
    title: String(r.title),
    excerpt: String(r.excerpt ?? ''),
    content: String(r.content ?? ''),
    featuredImage: str(r.featured_image),
    featuredAlt: str(r.featured_alt),
    category: str(r.category),
    tags,
    focusKeyword: str(r.focus_keyword),
    seoTitle: str(r.seo_title),
    metaDescription: str(r.meta_description),
    author: String(r.author ?? 'Matchly'),
    status: r.status === 'published' ? 'published' : 'draft',
    publishedAt: str(r.published_at),
    noSocial: Number(r.no_social ?? 0) === 1,
    updatedAt: String(r.updated_at),
    createdAt: String(r.created_at),
  }
}

// ---------------------------------------------------------------- the text

/** The editor's HTML, reduced to what an article may contain (no scripts, styles or event handlers) */
export function cleanHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ['p', 'h2', 'h3', 'h4', 'strong', 'b', 'em', 'i', 'u', 's', 'a', 'ul', 'ol', 'li', 'blockquote', 'img', 'figure', 'figcaption', 'br', 'hr', 'code', 'pre', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
    allowedAttributes: { a: ['href', 'target', 'rel'], img: ['src', 'alt', 'title', 'width', 'height'], th: ['colspan'], td: ['colspan'] },
    allowedSchemes: ['https', 'http', 'mailto'],
    // Pictures only from our own uploads or https
    allowedSchemesByTag: { img: ['https'] },
    allowProtocolRelative: false,
    transformTags: {
      a: (_tag: string, attribs: sanitizeHtml.Attributes) => {
        const href = attribs.href ?? ''
        const external = /^https?:\/\//i.test(href) && !/^https?:\/\/(www\.)?matchly\.dk/i.test(href)
        const attrs: sanitizeHtml.Attributes = external ? { href, target: '_blank', rel: 'noopener noreferrer' } : { href }
        return { tagName: 'a', attribs: attrs }
      },
    },
    exclusiveFilter: (frame) => frame.tag === 'img' && !/^(\/uploads\/|https:\/\/)/.test(frame.attribs.src ?? ''),
  })
}

/** Plain text of the article (for word counts, excerpts and SEO checks) */
export const plainText = (html: string) =>
  sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()

export const readingMinutes = (html: string) => Math.max(1, Math.round(plainText(html).split(' ').filter(Boolean).length / 200))

// ---------------------------------------------------------------- reading

const isLive = (a: Article, now = Date.now()) => a.status === 'published' && !!a.publishedAt && Date.parse(a.publishedAt) <= now

/** Published articles, newest first (scheduled ones only from their time) */
/** Categories kept out of the article list's main stream and "Læs også" (still on their own tab, club pages, feed and sitemap) */
export const OWN_TAB_CATEGORIES = ['referater']

export function publishedArticles(opts: { category?: string; tag?: string; limit?: number; offset?: number; mainStream?: boolean } = {}): { articles: Article[]; total: number } {
  const all = open(
    (db) => db.prepare(`SELECT * FROM articles WHERE status = 'published' ORDER BY published_at DESC`).all().map(toArticle),
    [] as Article[],
  ).filter(
    (a) =>
      isLive(a) &&
      (!opts.category || a.category === opts.category) &&
      (!opts.tag || a.tags.some((t) => slugify(t) === opts.tag)) &&
      // The match reports have their own tab: not in the main list (opts.mainStream)
      (!opts.mainStream || !OWN_TAB_CATEGORIES.includes(a.category ?? '')),
  )
  const offset = opts.offset ?? 0
  return { articles: all.slice(offset, offset + (opts.limit ?? all.length)), total: all.length }
}

/** A published article by its slug (not drafts or scheduled ones) */
export function articleBySlug(slug: string): Article | undefined {
  const a = open((db) => db.prepare('SELECT * FROM articles WHERE slug = ?').get(slug), undefined as Row | undefined)
  const article = a && toArticle(a)
  return article && isLive(article) ? article : undefined
}

/** Any article by its address, also drafts and scheduled ones (the admin's preview) */
export function articleBySlugAny(slug: string): Article | undefined {
  const a = open((db) => db.prepare('SELECT * FROM articles WHERE slug = ?').get(slug), undefined as Row | undefined)
  return a && toArticle(a)
}

/** Any article by id (admin) */
export function articleById(id: number): Article | undefined {
  const r = open((db) => db.prepare('SELECT * FROM articles WHERE id = ?').get(id), undefined as Row | undefined)
  return r && toArticle(r)
}

/** Every article (admin list), newest change first */
export function allArticles(): Article[] {
  return open((db) => db.prepare('SELECT * FROM articles ORDER BY updated_at DESC').all().map(toArticle), [])
}

export function categories(): Category[] {
  return open((db) => db.prepare('SELECT slug, name FROM categories ORDER BY name').all().map((r) => ({ slug: String(r.slug), name: String(r.name) })), [])
}

export const categoryName = (slug?: string) => (slug ? categories().find((c) => c.slug === slug)?.name : undefined)

/** Every tag in use on published articles, with how many */
export function allTags(): { name: string; slug: string; count: number }[] {
  const counts = new Map<string, { name: string; count: number }>()
  for (const a of publishedArticles().articles) {
    for (const t of a.tags) {
      const s = slugify(t)
      counts.set(s, { name: counts.get(s)?.name ?? t, count: (counts.get(s)?.count ?? 0) + 1 })
    }
  }
  return [...counts.entries()].map(([slug, v]) => ({ slug, ...v })).sort((a, b) => b.count - a.count)
}

// ---------------------------------------------------------------- writing (admin)

export function addCategory(name: string): { category?: Category; error?: string } {
  const clean = name.trim().slice(0, 60)
  const slug = slugify(clean)
  if (!clean || !slug) return { error: 'Skriv et navn' }
  open((db) => db.prepare('INSERT OR IGNORE INTO categories (slug, name) VALUES (?, ?)').run(slug, clean), undefined)
  return { category: { slug, name: clean } }
}

/** Saves an article (new without id); returns it, or what is wrong */
export function saveArticle(input: ArticleInput): { article?: Article; error?: string } {
  const title = String(input.title ?? '').trim().slice(0, 200)
  if (!title) return { error: 'Artiklen mangler en titel' }
  const slug = slugify(String(input.slug || title)).slice(0, 120)
  if (!slug) return { error: 'Permalinket er tomt' }
  const status: ArticleStatus = input.status === 'published' ? 'published' : 'draft'
  const now = new Date().toISOString()
  const publishedAt = input.publishedAt && !Number.isNaN(Date.parse(input.publishedAt)) ? new Date(input.publishedAt).toISOString() : status === 'published' ? now : undefined
  const tags = [...new Set((input.tags ?? []).map((t) => String(t).trim().slice(0, 40)).filter(Boolean))].slice(0, 20)
  const image = (v?: string) => (v && /^(\/uploads\/[a-z0-9]+\.(webp|jpg|png|gif)|https:\/\/\S+)$/.test(v) ? v : undefined)
  const row = [
    slug,
    title,
    String(input.excerpt ?? '').trim().slice(0, 400),
    cleanHtml(String(input.content ?? '')),
    image(input.featuredImage) ?? null,
    String(input.featuredAlt ?? '').trim().slice(0, 200) || null,
    input.category ? slugify(input.category) : null,
    JSON.stringify(tags),
    String(input.focusKeyword ?? '').trim().slice(0, 80) || null,
    String(input.seoTitle ?? '').trim().slice(0, 120) || null,
    String(input.metaDescription ?? '').trim().slice(0, 320) || null,
    String(input.author ?? 'Matchly').trim().slice(0, 80) || 'Matchly',
    status,
    publishedAt ?? null,
    now,
  ]
  try {
    const id = open((db) => {
      const taken = db.prepare('SELECT id FROM articles WHERE slug = ?').get(slug)
      if (taken && Number(taken.id) !== input.id) throw new Error('Permalinket bruges allerede af en anden artikel')
      if (input.id) {
        db.prepare(
          `UPDATE articles SET slug=?, title=?, excerpt=?, content=?, featured_image=?, featured_alt=?, category=?, tags=?, focus_keyword=?, seo_title=?, meta_description=?, author=?, status=?, published_at=?, updated_at=? WHERE id=?`,
        ).run(...row, input.id)
        // Only the editor sends the choice; other writers (the preview robots) keep it
        if (input.noSocial !== undefined) db.prepare('UPDATE articles SET no_social = ? WHERE id = ?').run(input.noSocial ? 1 : 0, input.id)
        return input.id
      }
      const res = db
        .prepare(
          `INSERT INTO articles (slug, title, excerpt, content, featured_image, featured_alt, category, tags, focus_keyword, seo_title, meta_description, author, status, published_at, updated_at, created_at, no_social)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(...row, now, input.noSocial ? 1 : 0)
      return Number(res.lastInsertRowid)
    }, 0)
    const article = articleById(id)
    return article ? { article } : { error: 'Kunne ikke gemme' }
  } catch (err) {
    return { error: (err as Error).message }
  }
}

export function deleteArticle(id: number) {
  open((db) => db.prepare('DELETE FROM articles WHERE id = ?').run(id), undefined)
}
