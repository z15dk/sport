import 'server-only'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { allClubs } from '../data/danishClubs'

// Club logos, looked up in this order:
// 1. A file in public/logos/<club-slug>.(svg|png|webp|jpg)
// 2. The badge from TheSportsDB (cached for a day)
// 3. Nothing – TeamBadge then draws the club's initials in its colours

const API_KEY = process.env.THESPORTSDB_KEY || process.env.VITE_THESPORTSDB_KEY || '3'
const EXTENSIONS = ['svg', 'png', 'webp', 'jpg']

// Names TheSportsDB uses where they differ from the Danish name
const SEARCH_NAMES: Record<string, string> = {
  fck: 'FC Copenhagen',
  bif: 'Brondby',
  agf: 'Aarhus',
  fcn: 'Nordsjaelland',
  rfc: 'Randers',
  ob: 'Odense',
  sif: 'Silkeborg',
  vff: 'Viborg',
  sje: 'Sonderjyske',
  lbk: 'Lyngby',
  ach: 'Horsens',
  vb: 'Vejle',
  aab: 'Aalborg',
  fcf: 'Fredericia',
  efb: 'Esbjerg',
  hif: 'Hvidovre',
  kif: 'Kolding IF',
  hbk: 'HB Koge',
  'hik-ob': 'Hobro',
  hil: 'Hillerod',
  vff2: 'Vendsyssel',
  ab: 'Akademisk Boldklub',
  afr: 'Aarhus Fremad',
  b93: 'B93',
  mbk: 'Middelfart',
  fcr: 'FC Roskilde',
  nbk: 'Naestved',
  fam: 'Fremad Amager',
  sik: 'Skive',
  frem: 'BK Frem',
  fch: 'Helsingor',
}

function localLogo(slug: string): string | undefined {
  for (const ext of EXTENSIONS) {
    if (existsSync(path.join(process.cwd(), 'public', 'logos', `${slug}.${ext}`))) return `/logos/${slug}.${ext}`
  }
  return undefined
}

interface ApiTeam {
  strTeam: string
  strSport?: string
  strCountry?: string
  strBadge?: string | null
  strTeamBadge?: string | null
}

async function apiBadge(search: string): Promise<string | undefined> {
  try {
    const res = await fetch(
      `https://www.thesportsdb.com/api/v1/json/${API_KEY}/searchteams.php?t=${encodeURIComponent(search)}`,
      { next: { revalidate: 86_400 }, signal: AbortSignal.timeout(4000) },
    )
    if (!res.ok) return undefined
    const data: { teams: ApiTeam[] | null } = await res.json()
    const team = (data.teams ?? []).find((t) => t.strSport === 'Soccer' && t.strCountry === 'Denmark')
    const badge = team?.strBadge || team?.strTeamBadge
    return badge ? `${badge}/small` : undefined
  } catch {
    return undefined
  }
}

let cached: Promise<Record<string, string>> | undefined

/** Map of club name -> logo URL for every club that has one */
export function getClubBadges(): Promise<Record<string, string>> {
  cached ??= (async () => {
    const entries = await Promise.all(
      allClubs().map(async ({ club }) => {
        const url = localLogo(club.slug) ?? (await apiBadge(SEARCH_NAMES[club.id] ?? club.name))
        return url ? ([club.name, url] as const) : undefined
      }),
    )
    return Object.fromEntries(entries.filter((e) => e !== undefined))
  })()
  return cached
}
