import 'server-only'
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { CHANNELS } from '../data/partners'
import { cacheDir } from './tsdb'

// Links on the channel logos, set in the admin pages, by channel id. Kept in
// /opt/scoreline/data/channel-links.json so they survive deploys.

const file = (): string => process.env.CHANNEL_LINKS_FILE ?? path.join(/*turbopackIgnore: true*/ cacheDir(), 'data', 'channel-links.json')

let cache: { mtime: number; links: Record<string, string> } = { mtime: -1, links: {} }

export function channelLinks(): { version: string; links: Record<string, string> } {
  let mtime = 0
  try {
    mtime = statSync(file()).mtimeMs
  } catch {
    // no links yet
  }
  if (mtime !== cache.mtime) {
    let links: Record<string, string> = {}
    try {
      links = mtime ? (JSON.parse(readFileSync(file(), 'utf8')) as Record<string, string>) : {}
    } catch {
      links = {}
    }
    cache = { mtime, links }
  }
  return { version: String(Math.round(cache.mtime)), links: cache.links }
}

/** Sets a channel's link; an empty link removes it. Only http(s) addresses. */
export function setChannelLink(id: string, url: string): { error?: string } {
  if (!CHANNELS.some((c) => c.id === id)) return { error: 'Ukendt kanal' }
  const clean = url.trim()
  if (clean) {
    let parsed: URL
    try {
      parsed = new URL(clean)
    } catch {
      return { error: 'Skriv en hel adresse, fx https://direktesport.dk' }
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return { error: 'Adressen skal starte med https://' }
    if (clean.length > 500) return { error: 'Adressen er for lang' }
  }
  const links = { ...channelLinks().links }
  if (clean) links[id] = clean
  else delete links[id]
  mkdirSync(path.dirname(file()), { recursive: true })
  writeFileSync(`${file()}.tmp`, JSON.stringify(links, null, 2))
  renameSync(`${file()}.tmp`, file())
  return {}
}
