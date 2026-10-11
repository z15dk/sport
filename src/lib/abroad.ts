import 'server-only'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { teamByName, type TeamEntry } from '../data/teams'
import { cleanHtml } from './articles'
import { cacheDir } from './tsdb'

// "Danskere i udlandet" (the owner's word 11/10-2026): the Danish players in foreign clubs, kept up to date by James
// (deploy/claude-editor/UDLANDET.md, /api/redaktor/udlandet) – who plays where, a line on how it goes, and a weekly
// roundup. The page (/danskere-i-udlandet) adds each club's last and next match from our own match data.
// State in data/udlandet.json.

export interface AbroadPlayer {
  name: string
  /** The club as Matchly writes it (matchly-api soeg) */
  club: string
  position?: string
  /** James' line on how it goes, e.g. "Scorede i 2-1-sejren over Lyon – tre mål i fire kampe" */
  note?: string
}

export interface Abroad {
  players: AbroadPlayer[]
  /** James' weekly roundup (HTML) */
  roundup?: string
  roundupAt?: number
  playersAt?: number
}

const file = () => path.join(/*turbopackIgnore: true*/ cacheDir(), 'data', 'udlandet.json')

export function readAbroad(): Abroad {
  try {
    const s = JSON.parse(readFileSync(file(), 'utf8')) as Partial<Abroad>
    return { ...s, players: s.players ?? [] }
  } catch {
    return { players: [] }
  }
}

function save(a: Abroad) {
  mkdirSync(path.dirname(file()), { recursive: true })
  writeFileSync(file(), JSON.stringify(a, null, 2))
}

/** A player's club in our register (the football one) */
export const abroadTeam = (club: string): TeamEntry | undefined => {
  const t = teamByName(club)
  return t && t.sport === 'soccer' ? t : undefined
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')

/** Replaces the whole list (James sends all players each time); every club must be one Matchly knows */
export function setAbroadPlayers(list: unknown, now = Date.now()): { error?: string; unknownClubs?: string[]; count?: number } {
  if (!Array.isArray(list) || list.length === 0) return { error: 'players skal være en liste' }
  if (list.length > 150) return { error: 'Højst 150 spillere' }
  const players: AbroadPlayer[] = []
  const unknown: string[] = []
  for (const raw of list as Record<string, unknown>[]) {
    const p = { name: str(raw?.name, 60), club: str(raw?.club, 60), position: str(raw?.position, 30) || undefined, note: str(raw?.note, 220) || undefined }
    if (!p.name || !p.club) return { error: 'Hver spiller skal have name og club' }
    if (!abroadTeam(p.club)) unknown.push(p.club)
    players.push(p)
  }
  if (unknown.length) return { error: 'Klubber, Matchly ikke kender – find navnet med matchly-api soeg', unknownClubs: [...new Set(unknown)] }
  const names = new Set<string>()
  for (const p of players) {
    if (names.has(p.name.toLowerCase())) return { error: `${p.name} står der to gange` }
    names.add(p.name.toLowerCase())
  }
  save({ ...readAbroad(), players, playersAt: now })
  return { count: players.length }
}

/** Saves the weekly roundup: a few paragraphs (HTML), links only as in articles */
export function setAbroadRoundup(html: unknown, now = Date.now()): { error?: string } {
  const clean = cleanHtml(typeof html === 'string' ? html : '')
  const n = clean.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().length
  if (n < 300 || n > 3000) return { error: `Opsamlingen skal være 300–3.000 tegn (den er ${n})` }
  if (/<h1|<table|<img/i.test(clean)) return { error: 'Kun afsnit, mellemrubrikker (h2/h3), lister, fed, kursiv og links' }
  save({ ...readAbroad(), roundup: clean, roundupAt: now })
  return {}
}
