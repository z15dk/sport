import 'server-only'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { allClubs } from '../data/danishClubs'

// Club logos, looked up in this order:
// 1. A file in public/logos/<club-slug>.(svg|png|webp|jpg)
// 2. The badge from TheSportsDB (cached for a day): first from the team lists of
//    the Danish leagues it covers, then by searching for the club by name
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

// TheSportsDB league names for the divisions it covers (3. division is not covered)
const API_LEAGUES = ['Danish Superliga', 'Danish 1st Division', 'Danish 2nd Division']

interface ApiTeam {
  strTeam: string
  strTeamAlternate?: string | null
  strTeamShort?: string | null
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

/** Lowercase, no accents or Danish letters, no punctuation or common club prefixes */
function normalize(name: string) {
  return ` ${name
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'aa')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')} `
    .replace(/ (fc|bk|if|ik|ff|fb|boldklub|fodbold|football club) /g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function leagueTeams(): Promise<ApiTeam[]> {
  const lists = await Promise.all(
    API_LEAGUES.map(async (league) => {
      try {
        const res = await fetch(
          `https://www.thesportsdb.com/api/v1/json/${API_KEY}/search_all_teams.php?l=${encodeURIComponent(league)}`,
          { next: { revalidate: 86_400 }, signal: AbortSignal.timeout(4000) },
        )
        if (!res.ok) return []
        const data: { teams: ApiTeam[] | null } = await res.json()
        return data.teams ?? []
      } catch {
        return []
      }
    }),
  )
  return lists.flat()
}

function badgeFromList(teams: ApiTeam[], names: string[]): string | undefined {
  const wanted = names.map(normalize).filter(Boolean)
  const team = teams.find((t) => {
    const theirs = [t.strTeam, t.strTeamAlternate, t.strTeamShort]
      .flatMap((n) => (n ? n.split(',') : []))
      .map(normalize)
      .filter(Boolean)
    return theirs.some((n) => wanted.includes(n))
  })
  const badge = team?.strBadge || team?.strTeamBadge
  return badge ? `${badge}/small` : undefined
}

let cached: Promise<Record<string, string>> | undefined

/** Map of club name -> logo URL for every club that has one */
export function getClubBadges(): Promise<Record<string, string>> {
  cached ??= (async () => {
    const teams = await leagueTeams()
    const entries = await Promise.all(
      allClubs().map(async ({ club }) => {
        const search = SEARCH_NAMES[club.id] ?? club.name
        const url =
          localLogo(club.slug) ??
          badgeFromList(teams, [club.name, search]) ??
          (await apiBadge(search))
        return url ? ([club.name, url] as const) : undefined
      }),
    )
    const map = Object.fromEntries(entries.filter((e) => e !== undefined))
    // Try again on the next request if nothing came back (e.g. the API was down)
    if (Object.keys(map).length === 0) cached = undefined
    return map
  })()
  return cached
}
