import 'server-only'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { cacheDir } from './tsdb'
import type { Quality } from './previews/quality'
import type { Facts } from './previews/facts'

// The quality mark of each automatic article (green or yellow, with the reasons), by article id, kept in
// data/article-quality.json: the approval mail and the morning mail show it, and "Udgiv alle" only takes
// the green ones. The Claude editor on the server adds its own verdict to the same line (src/lib/previews).

export interface QualityMark extends Quality {
  at: number
  /** What kind of article: an automatic preview or match report */
  kind: 'preview' | 'report'
  /** The league (our division id) */
  league: string
  /** The fact sheet and internal links the Claude writer works from (src/lib/previews/facts.ts) */
  facts?: Facts
  /** The Claude editor's short verdict, once it has read the draft */
  editor?: { verdict: string; ok: boolean; at: number }
  /** The Claude writer has rewritten the text as sports journalism: the morning check never puts the template back */
  rewritten?: boolean
}

const file = () => path.join(/*turbopackIgnore: true*/ cacheDir(), 'data', 'article-quality.json')

export function readQuality(): Record<string, QualityMark> {
  try {
    return JSON.parse(readFileSync(file(), 'utf8')) as Record<string, QualityMark>
  } catch {
    return {}
  }
}

export const qualityOf = (id: number): QualityMark | undefined => readQuality()[String(id)]

export function saveQuality(id: number, mark: Omit<QualityMark, 'at'> & { at?: number }) {
  const all = readQuality()
  const before = all[String(id)]
  // A new automatic check keeps the editor's verdict only when the text it read is unchanged (same reasons and level)
  all[String(id)] = { ...mark, at: mark.at ?? Date.now(), facts: mark.facts ?? before?.facts, rewritten: mark.rewritten ?? before?.rewritten, editor: mark.editor ?? (before && before.level === mark.level ? before.editor : undefined) }
  // Old marks go after 90 days
  const cut = Date.now() - 90 * 24 * 3600_000
  for (const [k, v] of Object.entries(all)) if (v.at < cut) delete all[k]
  mkdirSync(path.dirname(file()), { recursive: true })
  writeFileSync(file(), JSON.stringify(all, null, 2))
}

export function saveEditorVerdict(id: number, verdict: string, ok: boolean): boolean {
  const all = readQuality()
  const mark = all[String(id)]
  if (!mark) return false
  mark.editor = { verdict: verdict.slice(0, 600), ok, at: Date.now() }
  mkdirSync(path.dirname(file()), { recursive: true })
  writeFileSync(file(), JSON.stringify(all, null, 2))
  return true
}

/** The mark as a short Danish line for mails ("Grøn", "Gul: Kun 300 ord · …") */
export function qualityLine(m?: QualityMark): string {
  if (!m) return ''
  const base = m.level === 'green' ? 'Grøn – klar til udgivelse' : `Gul – læs den: ${m.reasons.join(' · ')}`
  return m.editor ? `${base}. Redaktøren: ${m.editor.verdict}` : base
}
