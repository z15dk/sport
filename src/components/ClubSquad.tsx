import Link from 'next/link'
import { playerPath } from '../data/player'
import type { SquadPlayer } from '../lib/apisports'
import { counted } from '../lib/words'

// The club page's squad box: the club's top scorers, and the players it has used in the league this
// season by position, each with a link to the player's page. From the saved line-ups (apiTeamSquad),
// so only players who have been in a match squad. Styles: ".squad" in globals.css.

const GROUPS: { pos: string; title: string }[] = [
  { pos: 'G', title: 'Målmænd' },
  { pos: 'D', title: 'Forsvar' },
  { pos: 'M', title: 'Midtbane' },
  { pos: 'F', title: 'Angreb' },
]
const matchesOf = (p: SquadPlayer) => p.starts + p.subbedOn

export function ClubSquad({ name, league, season, players, id }: { name: string; league: string; season: string; players: SquadPlayer[]; id?: string }) {
  if (!players.length) return null
  const scorers = players.filter((p) => p.goals > 0).sort((a, b) => b.goals - a.goals || matchesOf(a) - matchesOf(b) || a.name.localeCompare(b.name, 'da')).slice(0, 5)
  const groups = GROUPS.map((g) => ({
    ...g,
    players: players.filter((p) => p.pos === g.pos).sort((a, b) => matchesOf(b) - matchesOf(a) || b.starts - a.starts || (a.number ?? 99) - (b.number ?? 99)),
  })).filter((g) => g.players.length)
  return (
    <section className="panel squad kh-target" id={id}>
      <h2 className="panel__title">Trup og topscorere</h2>
      <p className="squad__sub">
        Spillere, som {name} har haft i kamptruppen i {league} {season}.
      </p>
      {scorers.length > 0 && (
        <>
          <h3 className="squad__head">Klubbens topscorere</h3>
          <ol className="squad__scorers">
            {scorers.map((p) => (
              <li key={p.id}>
                <Link className="squad__scorer" href={playerPath(p.id, p.name)} prefetch={false}>
                  <span className="squad__goals">
                    <strong>{p.goals}</strong>
                    <span>mål</span>
                  </span>
                  <span className="squad__text">
                    <span className="squad__name">{p.name}</span>
                    <span className="squad__meta">{counted(matchesOf(p), 'kamp', 'kampe')}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </>
      )}
      <div className="squad__groups">
        {groups.map((g) => (
          <div key={g.pos} className="squad__group">
            <h3 className="squad__head">{g.title}</h3>
            <ul className="squad__list">
              {g.players.map((p) => (
                <li key={p.id}>
                  <Link className="squad__player" href={playerPath(p.id, p.name)} prefetch={false}>
                    <span className="squad__no" aria-hidden={p.number === undefined}>
                      {p.number ?? ''}
                    </span>
                    <span className="squad__name">{p.name}</span>
                    <span className="squad__meta">
                      {matchesOf(p) > 0 ? counted(matchesOf(p), 'kamp', 'kampe') : 'På bænken'}
                      {p.goals > 0 && `, ${p.goals} mål`}
                    </span>
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
