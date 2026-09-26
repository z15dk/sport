import 'server-only'
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { cacheDir } from './tsdb'
import type { SiteSettings } from '../data/real'

// Site settings changed in the admin pages (e.g. odds on or off), kept in
// /opt/scoreline/data/settings.json so they survive deploys.

const DEFAULTS: SiteSettings = { odds: false }

const file = (): string => process.env.SETTINGS_FILE ?? path.join(/*turbopackIgnore: true*/ cacheDir(), 'data', 'settings.json')

let cache: { mtime: number; settings: SiteSettings } = { mtime: -1, settings: DEFAULTS }

/** The settings and a version that changes with them */
export function siteSettings(): { version: string; settings: SiteSettings } {
  let mtime = 0
  try {
    mtime = statSync(file()).mtimeMs
  } catch {
    // defaults
  }
  if (mtime !== cache.mtime) {
    let saved: Partial<SiteSettings> = {}
    try {
      saved = mtime ? (JSON.parse(readFileSync(file(), 'utf8')) as Partial<SiteSettings>) : {}
    } catch {
      saved = {}
    }
    cache = { mtime, settings: { ...DEFAULTS, odds: saved.odds === true } }
  }
  return { version: String(Math.round(cache.mtime)), settings: cache.settings }
}

/** Changes one setting */
export function setSetting(key: string, value: unknown): { error?: string } {
  if (key !== 'odds' || typeof value !== 'boolean') return { error: 'Ukendt indstilling' }
  const settings = { ...siteSettings().settings, [key]: value }
  mkdirSync(path.dirname(file()), { recursive: true })
  writeFileSync(`${file()}.tmp`, JSON.stringify(settings, null, 2))
  renameSync(`${file()}.tmp`, file())
  return {}
}
