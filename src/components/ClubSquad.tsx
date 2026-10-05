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

export function ClubSquad({ name, league, season, players, id }: { name: string; league: string; season?: string; players: SquadPlayer[]; id?: string }) {
  if (!players.length) return null
  const scorers = players.filter((p) => p.goals > 0).sort((a, b) => b.goals - a.goals || matchesOf(a) - matchesOf(b) || a.name.localeCompare(b.name, 'da')).slice(0, 3)
  // A player the line-ups give no position stands last, under "Øvrige", so everyone counted is shown
  const known = new Set(GROUPS.map((g) => g.pos))
  const groups = [...GROUPS, { pos: '', title: 'Øvrige' }].map((g) => ({
    ...g,
    players: players.filter((p) => (g.pos ? p.pos === g.pos : !p.pos || !known.has(p.pos))).sort((a, b) => matchesOf(b) - matchesOf(a) || b.starts - a.starts || (a.number ?? 99) - (b.number ?? 99)),
  })).filter((g) => g.players.length)
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
                <li key={p.id}>
                  <Link className="squad__scorer" href={playerPath(p.id, p.name)} prefetch={false}>
                    <PlayerPhoto photo={p.photo} team={name} size={52} />
                    <span className="squad__text">
                      <span className="squad__name">{p.name}</span>
                      <span className="squad__meta">{counted(matchesOf(p), 'kamp', 'kampe')}</span>
                    </span>
                    <span className="squad__goals">
                      <strong>{p.goals}</strong>
                      <span>mål</span>
                    </span>
                  </Link>
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
                <li key={p.id}>
                  <Link className="squad__player" href={playerPath(p.id, p.name)} prefetch={false}>
                    <span className="squad__face">
                      <PlayerPhoto photo={p.photo} team={name} size={44} />
                      {p.number !== undefined && (
                        <span className="squad__no">
                          <span className="visually-hidden">Nummer </span>
                          {p.number}
                        </span>
                      )}
                    </span>
                    <span className="squad__text">
                      <span className="squad__name">{p.name}</span>
                      <span className="squad__meta">{matchesOf(p) > 0 ? counted(matchesOf(p), 'kamp', 'kampe') : 'På bænken'}</span>
                    </span>
                    {p.goals > 0 && <span className="squad__pill">{p.goals} mål</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
