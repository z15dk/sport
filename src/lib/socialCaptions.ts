import 'server-only'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { cacheDir } from './tsdb'

// James' own text for an article's social post (the news scout writes it with the draft): used instead of the fixed
// opening + title + lead when the article is shared (articlePost in src/lib/socialEngine.ts). The link goes in the
// comments on Facebook and the clubs' @names are put in by withTags, as for every post. data/social-captions.json.

const file = () => path.join(/*turbopackIgnore: true*/ cacheDir(), 'data', 'social-captions.json')

type Store = Record<string, { text: string; at: number; by: string }>

function read(): Store {
  try {
    return JSON.parse(readFileSync(file(), 'utf8')) as Store
  } catch {
    return {}
  }
}

export const socialCaption = (articleId: number): string | undefined => read()[String(articleId)]?.text

export function setSocialCaption(articleId: number, text: string, by: string): { error?: string } {
  const t = text.trim()
  if (t.length < 20 || t.length > 600) return { error: `Opslaget skal være 20–600 tegn (er ${t.length})` }
  if (/https?:\/\/|www\./i.test(t)) return { error: 'Intet link i teksten – linket sættes på af sig selv (i kommentaren på Facebook)' }
  const s = read()
  s[String(articleId)] = { text: t, at: Date.now(), by }
  mkdirSync(path.dirname(file()), { recursive: true })
  writeFileSync(file(), JSON.stringify(s, null, 2))
  return {}
}
