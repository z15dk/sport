import 'server-only'
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { cacheDir } from './tsdb'
import { DEFAULT_SETTINGS, SETTINGS, isSettingKey, type SiteSettings } from '../data/settingsDef'

// Site settings changed in the admin pages (the list is in src/data/settingsDef.ts),
// kept in /opt/scoreline/data/settings.json so they survive deploys.

const file = (): string => process.env.SETTINGS_FILE ?? path.join(/*turbopackIgnore: true*/ cacheDir(), 'data', 'settings.json')

let cache: { mtime: number; settings: SiteSettings } = { mtime: -1, settings: DEFAULT_SETTINGS }

/** The settings (saved values over the defaults) and a version that changes with them */
export function siteSettings(): { version: string; settings: SiteSettings } {
  let mtime = 0
  try {
    mtime = statSync(file()).mtimeMs
  } catch {
    // defaults
  }
  if (mtime !== cache.mtime) {
    let saved: Record<string, unknown> = {}
    try {
      saved = mtime ? (JSON.parse(readFileSync(file(), 'utf8')) as Record<string, unknown>) : {}
    } catch {
      saved = {}
    }
    const settings = { ...DEFAULT_SETTINGS }
    for (const s of SETTINGS) if (typeof saved[s.key] === 'boolean') settings[s.key] = saved[s.key] as boolean
    cache = { mtime, settings }
  }
  return { version: String(Math.round(cache.mtime)), settings: cache.settings }
}

/** Changes one setting */
export function setSetting(key: string, value: unknown): { error?: string } {
  if (!isSettingKey(key) || typeof value !== 'boolean') return { error: 'Ukendt indstilling' }
  const settings = { ...siteSettings().settings, [key]: value }
  mkdirSync(path.dirname(file()), { recursive: true })
  writeFileSync(`${file()}.tmp`, JSON.stringify(settings, null, 2))
  renameSync(`${file()}.tmp`, file())
  return {}
}
