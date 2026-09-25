import Link from 'next/link'
import type { LeagueGroup } from '../types'
import { paths } from '../lib/site'
import { TeamBadge } from './TeamBadge'
import { Flag, hasFlag } from './Flag'
import { competitionLabel } from '../data/leagues'
import { danishCountry } from '../data/countries'
import { usePersistentState } from '../hooks/usePersistentState'

interface Props {
  groups: LeagueGroup[]
  pinned: Set<string>
  /** The tournament the match list is filtered to */
  selected?: string
  onSelect: (leagueId: string | undefined) => void
}

const isLive = (g: LeagueGroup) => g.matches.some((m) => m.state === 'live')

/** The day's tournaments by country, each country a drop-down; clicking a tournament filters the match list to it */
export function Sidebar({ groups, pinned, selected, onSelect }: Props) {
  const [openList, setOpenList] = usePersistentState<string[]>('openCountries', ['Danmark'])
  const favorites = groups.filter((g) => pinned.has(g.leagueId))
  const others = groups.filter((g) => !pinned.has(g.leagueId))

  // Countries with live matches first, then Denmark, then alphabetically; the groups keep their order within a country
  const byCountry = new Map<string, LeagueGroup[]>()
  for (const g of others) {
    const c = danishCountry(g.country)
    byCountry.set(c, [...(byCountry.get(c) ?? []), g])
  }
  const rank = (c: string, items: LeagueGroup[]) => (items.some(isLive) ? 0 : 2) + (c === 'Danmark' ? 0 : 1)
  const countries = [...byCountry.entries()].sort(
    ([a, x], [b, y]) => rank(a, x) - rank(b, y) || a.localeCompare(b, 'da'),
  )
  const toggle = (c: string) => setOpenList((list) => (list.includes(c) ? list.filter((x) => x !== c) : [...list, c]))

  const list = (items: LeagueGroup[], showCountry: boolean) => (
    <ul className="side-list">
      {items.map((g) => {
        const active = g.leagueId === selected
        return (
          <li key={g.leagueId} className={active ? 'is-active' : undefined}>
            <button type="button" aria-pressed={active} onClick={() => onSelect(active ? undefined : g.leagueId)}>
              <TeamBadge link={false} name={g.league} src={g.leagueBadge} size={20} label={competitionLabel(g.league)} />
              <span className="side-list__text" title={g.country ? `${g.league} · ${danishCountry(g.country)}` : g.league}>
                <span className="side-list__name">{g.league}</span>
                {showCountry && g.country && <span className="side-list__country">{danishCountry(g.country)}</span>}
              </span>
              {isLive(g) && <span className="live-dot" aria-label="Live" />}
              <span className="side-list__count">{g.matches.length}</span>
            </button>
            {g.leagueSlug ? (
              <Link className="side-list__page" href={paths.league(g.leagueSlug)} title={`${g.league}: stilling og statistik`} aria-label={`Gå til ${g.league}`}>
                ›
              </Link>
            ) : (
              <span className="side-list__page" aria-hidden />
            )}
          </li>
        )
      })}
    </ul>
  )

  return (
    <aside className="sidebar" aria-label="Turneringer">
      {selected && (
        <button type="button" className="side-reset" onClick={() => onSelect(undefined)}>
          ✕ Vis alle turneringer
        </button>
      )}
      {favorites.length > 0 && (
        <div className="panel">
          <h2 className="panel__title">Favoritter</h2>
          {list(favorites, true)}
        </div>
      )}
      <div className="panel">
        <h2 className="panel__title">Turneringer</h2>
        {countries.length > 0 ? (
          <ul className="side-countries">
            {countries.map(([country, items]) => {
              // A country holding the chosen tournament stays open
              const open = openList.includes(country) || items.some((g) => g.leagueId === selected)
              const count = items.reduce((n, g) => n + g.matches.length, 0)
              return (
                <li key={country} className={open ? 'side-country is-open' : 'side-country'}>
                  <button type="button" className="side-country__head" aria-expanded={open} onClick={() => toggle(country)}>
                    <span className="side-country__flag">
                      {hasFlag(country) ? (
                        <Flag country={country} />
                      ) : ['Europa', 'Verden', 'Øvrige'].includes(country) ? (
                        '🌍'
                      ) : (
                        <span className="side-country__code">{country.slice(0, 2).toUpperCase()}</span>
                      )}
                    </span>
                    <span className="side-country__name">{country}</span>
                    {items.some(isLive) && <span className="live-dot" aria-label="Live" />}
                    <span className="side-list__count">{count}</span>
                    <span className="side-country__chevron" aria-hidden>
                      ▾
                    </span>
                  </button>
                  {open && list(items, false)}
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="muted small pad">Ingen turneringer denne dag</p>
        )}
      </div>
    </aside>
  )
}
