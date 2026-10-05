import type { ReactNode } from 'react'
import Link from 'next/link'
import { playerPath } from '../data/player'
import type { SquadPlayer } from '../lib/apisports'
import { counted } from '../lib/words'
import { PlayerPhoto } from './PlayerPhoto'

// The club page's squad box. A dark band in Matchly's colours with the club's three top scorers,
// then the players the club has used in the league this season, as cards by position: photo, shirt
// number, matches and goals, each a link to the player's page. From the saved line-ups (apiTeamSquad),
// so only players who have been in a match squad. Styles: ".squad" in globals.css.

const GROUPS: { pos: string; title: string }[] = [
  { pos: 'G', title: 'Målmænd' },
  { pos: 'D', title: 'Forsvar' },
  { pos: 'M', title: 'Midtbane' },
  { pos: 'F', title: 'Angreb' },
]
const matchesOf = (p: SquadPlayer) => p.starts + p.subbedOn
/**
 * "9 kampe", for a squad from DBU's sheets "9 kampe · 720 min." once the match pages' substitutions are read (the minutes
 * come from them), before that "9 fra start, 4 på bænken" (the sheets do not say who came on)
 */
const metaOf = (p: SquadPlayer) =>
  p.dbu && p.minutes === undefined
    ? [p.starts > 0 && `${p.starts} fra start`, (p.bench ?? 0) > 0 && `${p.bench} på bænken`].filter(Boolean).join(', ') || 'På bænken'
    : matchesOf(p) > 0
      ? `${counted(matchesOf(p), 'kamp', 'kampe')}${p.minutes ? ` · ${p.minutes} min.` : ''}`
      : p.dbu && (p.bench ?? 0) > 0
        ? `${p.bench} på bænken`
        : 'På bænken'
const cardsOf = (p: SquadPlayer) => (p.yellow ?? 0) + (p.red ?? 0)
const linkOf = (p: SquadPlayer) => (p.id ? playerPath(p.id, p.name) : undefined)

/** The player's photo; a drawn person where we have none (DBU's sheets have names and numbers only) */
function Face({ photo, team, size }: { photo?: string; team: string; size: number }) {
  if (photo) return <PlayerPhoto photo={photo} team={team} size={size} />
  return (
    <span className="squad__avatar" style={{ width: size, height: size }} aria-hidden>
      <svg viewBox="0 0 40 40" width={size} height={size} focusable="false">
        <circle cx="20" cy="15" r="7.5" />
        <path d="M5 40c0-10 6.5-16 15-16s15 6 15 16z" />
      </svg>
    </span>
  )
}

/** A link to the player's page, or a plain box for a player who has none (DBU's sheets give no player ids) */
function Wrap({ className, href, children }: { className: string; href?: string; children: ReactNode }) {
  return href ? (
    <Link className={className} href={href} prefetch={false}>
      {children}
    </Link>
  ) : (
    <div className={className}>{children}</div>
  )
}

export function ClubSquad({ name, league, season, players, id }: { name: string; league: string; season?: string; players: SquadPlayer[]; id?: string }) {
  if (!players.length) return null
  const scorers = players.filter((p) => p.goals > 0).sort((a, b) => b.goals - a.goals || matchesOf(a) - matchesOf(b) || a.name.localeCompare(b.name, 'da')).slice(0, 3)
  // A player the line-ups give no position stands last, under "Øvrige", so everyone counted is shown
  const known = new Set(GROUPS.map((g) => g.pos))
  // A squad with no positions (DBU's sheets) is one list
  const noPositions = players.every((p) => !p.pos || !known.has(p.pos))
  const groups = (noPositions ? [{ pos: '', title: 'Spillere' }] : [...GROUPS, { pos: '', title: 'Øvrige' }]).map((g) => ({
    ...g,
    players: players.filter((p) => (g.pos ? p.pos === g.pos : !p.pos || !known.has(p.pos))).sort((a, b) => matchesOf(b) - matchesOf(a) || b.starts - a.starts || (a.number ?? 99) - (b.number ?? 99)),
  })).filter((g) => g.players.length)
  // The team's cards and the players with most, where the match pages have been read for them (DBU's)
  const carded = players.filter((p) => cardsOf(p) > 0)
  const discipline = carded.length
    ? {
        yellow: players.reduce((n, p) => n + (p.yellow ?? 0), 0),
        red: players.reduce((n, p) => n + (p.red ?? 0), 0),
        most: [...carded].sort((a, b) => cardsOf(b) - cardsOf(a) || (b.red ?? 0) - (a.red ?? 0) || a.name.localeCompare(b.name, 'da')).slice(0, 5),
      }
    : undefined
  return (
    <section className="panel squad kh-target" id={id}>
      <div className="squad__top">
        <span className="squad__brand" aria-hidden>
          Matchly<i>.</i>
        </span>
        <h2 className="squad__title">Trup og topscorere</h2>
        <p className="squad__sub">
          {name} i {league}{season ? ` ${season}` : ''}, {players.length} spillere brugt
        </p>
        {scorers.length > 0 && (
          <>
            <h3 className="squad__label">Klubbens topscorere</h3>
            <ol className="squad__scorers">
              {scorers.map((p) => (
                <li key={p.id ?? p.name}>
                  <Wrap className="squad__scorer" href={linkOf(p)}>
                    <Face photo={p.photo} team={name} size={52} />
                    <span className="squad__text">
                      <span className="squad__name">{p.name}</span>
                      <span className="squad__meta">{metaOf(p)}</span>
                    </span>
                    <span className="squad__goals">
                      <strong>{p.goals}</strong>
                      <span>mål</span>
                    </span>
                  </Wrap>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
      <div className="squad__body">
        {groups.map((g) => (
          <div key={g.pos || 'other'}>
            <h3 className="squad__head">
              {g.title} <span>{g.players.length}</span>
            </h3>
            <ul className="squad__list">
              {g.players.map((p) => (
                <li key={p.id ?? p.name}>
                  <Wrap className="squad__player" href={linkOf(p)}>
                    <span className="squad__face">
                      <Face photo={p.photo} team={name} size={44} />
                      {p.number !== undefined && (
                        <span className="squad__no">
                          <span className="visually-hidden">Nummer </span>
                          {p.number}
                        </span>
                      )}
                    </span>
                    <span className="squad__text">
                      <span className="squad__name">{p.name}</span>
                      <span className="squad__meta">{metaOf(p)}</span>
                    </span>
                    {(p.goals > 0 || (p.assists ?? 0) > 0 || cardsOf(p) > 0) && (
                      <span className="squad__tags">
                        {p.goals > 0 && <span className="squad__pill">{p.goals} mål</span>}
                        {(p.assists ?? 0) > 0 && <span className="squad__pill squad__pill--assist">{p.assists} assist.</span>}
                        {(p.yellow ?? 0) > 0 && (
                          <span className="squad__card squad__card--yellow" title={`${p.yellow} gule kort`}>
                            {p.yellow}
                            <span className="visually-hidden"> gule kort</span>
                          </span>
                        )}
                        {(p.red ?? 0) > 0 && (
                          <span className="squad__card squad__card--red" title={`${p.red} røde kort`}>
                            {p.red}
                            <span className="visually-hidden"> røde kort</span>
                          </span>
                        )}
                      </span>
                    )}
                  </Wrap>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {discipline && (
          <div className="squad__discipline">
            <h3 className="squad__head">Disciplin</h3>
            <p className="squad__sub squad__sub--dark">
              {name} har fået {counted(discipline.yellow, 'gult kort', 'gule kort')} og {counted(discipline.red, 'rødt kort', 'røde kort')} i {league}
              {season ? ` ${season}` : ''}.
            </p>
            <ol className="squad__carded">
              {discipline.most.map((p) => (
                <li key={p.id ?? p.name}>
                  <Wrap className="squad__carded-row" href={linkOf(p)}>
                    <span className="squad__name">{p.name}</span>
                    <span className="squad__tags">
                      {(p.yellow ?? 0) > 0 && <span className="squad__card squad__card--yellow">{p.yellow}<span className="visually-hidden"> gule kort</span></span>}
                      {(p.red ?? 0) > 0 && <span className="squad__card squad__card--red">{p.red}<span className="visually-hidden"> røde kort</span></span>}
                    </span>
                  </Wrap>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </section>
  )
}
