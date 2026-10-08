import 'server-only'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { cacheDir } from './tsdb'

// The owner's standing rules for the Claude writer (/admin/redaktoer): plain text added to its instructions on
// every run ("Skriv aldrig …", "Brug altid …"). Kept in data/editor-rules.json; the writer reads them through its API.

export interface EditorRules {
  text: string
  at: number
}

const file = () => path.join(/*turbopackIgnore: true*/ cacheDir(), 'data', 'editor-rules.json')

export function readEditorRules(): EditorRules {
  try {
    return JSON.parse(readFileSync(file(), 'utf8')) as EditorRules
  } catch {
    return { text: '', at: 0 }
  }
}

export function saveEditorRules(text: string) {
  mkdirSync(path.dirname(file()), { recursive: true })
  writeFileSync(file(), JSON.stringify({ text: text.slice(0, 4000), at: Date.now() }, null, 2))
}
