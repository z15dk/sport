'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { allTeams } from '../data/teams'
import { shownDivisions } from '../data/leagues'
import { getRealData } from '../data/real'
import { externalLeagueKey } from '../data/external'
import { divisionOfGame } from '../data/ourLeagues'
import { SEARCH_NAMES, normalize } from '../data/aliases'
import { danishCountry } from '../data/countries'
import { sportById } from '../sports'
import { paths } from '../lib/site'
import { TeamBadge } from './TeamBadge'

interface Hit {
  href: string
  name: string
  sub: string
  logo?: string
  colors?: [string, string]
  /** Lower is better: the name starts with the query */
  rank: number
}

/** Folded text for matching: "Brøndby" and "brondby" alike */
const fold = (s: string) => normalize(s).trim()

/** Clubs and tournaments whose name (or short name, like "FCK") matches the search, linking to their pages */
export function SearchSuggestions({ query, onPick }: { query: string; onPick: () => void }) {
  const dataVersion = getRealData()?.version
  const q = fold(query)
  const hits = useMemo(() => {
    if (q.length < 2) return { clubs: [] as Hit[], leagues: [] as Hit[] }
    const score = (names: string[]) => {
      const folded = names.filter(Boolean).map(fold)
      if (folded.some((n) => n === q || n.startsWith(q))) return 0
      if (folded.some((n) => n.split(' ').some((w) => w.startsWith(q)))) return 1
      if (folded.some((n) => n.includes(q))) return 2
      return -1
    }
    const clubs: Hit[] = []
    for (const t of allTeams()) {
      const club = t.season?.club
      const rank = score([t.name, ...(t.names ?? []), club?.originalName ?? '', club?.apiName ?? '', club ? club.id : '', club ? (SEARCH_NAMES[club.id] ?? '') : ''])
      if (rank < 0) continue
      clubs.push({ href: paths.club(t.slug), name: t.name, sub: [sportById(t.sport).label, t.league].filter(Boolean).join(' · '), logo: t.logo, colors: t.colors ?? club?.colors, rank })
    }
    const leagues: Hit[] = []
    for (const d of shownDivisions()) {
      const rank = score([d.name, d.originalName ?? '', d.apiLeague ?? ''])
      if (rank >= 0) leagues.push({ href: paths.league(d.slug), name: d.name, sub: `${sportById(d.sport ?? 'soccer').label} · ${danishCountry(d.country)}`, rank })
    }
    const seen = new Set<string>()
    for (const g of getRealData()?.external ?? []) {
      if (divisionOfGame(g)) continue
      const key = externalLeagueKey(g.league)
      if (seen.has(key)) continue
      seen.add(key)
      const rank = score([g.league.name, g.league.originalName ?? '', danishCountry(g.league.country)])
      if (rank >= 0) leagues.push({ href: paths.league(key), name: g.league.name, sub: `${sportById(g.sport).label} · ${danishCountry(g.league.country)}`, logo: g.league.logo, rank })
    }
    const order = (a: Hit, b: Hit) => a.rank - b.rank || a.name.localeCompare(b.name, 'da')
    // The same team or league listed under two of the source's names shows once
    const once = (list: Hit[]) => list.filter((h, i) => list.findIndex((x) => x.name === h.name && x.sub === h.sub) === i)
    return { clubs: once(clubs.sort(order)).slice(0, 6), leagues: once(leagues.sort(order)).slice(0, 5) }
  }, [q, dataVersion]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!hits.clubs.length && !hits.leagues.length) return null
  return (
    <div className="search-hits" role="listbox" aria-label="Forslag">
      {([['Klubber', hits.clubs], ['Turneringer', hits.leagues]] as const).map(([title, list]) =>
        list.length ? (
          <div key={title} className="search-hits__group">
            <span className="search-hits__title">{title}</span>
            {list.map((h) => (
              <Link key={h.href} href={h.href} className="search-hits__item" role="option" aria-selected={false} onClick={onPick}>
                <TeamBadge link={false} name={h.name} src={h.logo} colors={h.colors} size={26} />
                <span>
                  <strong>{h.name}</strong>
                  <em>{h.sub}</em>
                </span>
              </Link>
            ))}
          </div>
        ) : null,
      )}
    </div>
  )
}
