import Link from 'next/link'
import type { Match } from '../../types'
import type { LastXI, MatchDeep, SeasonPlayer, WinChance } from '../../data/matchDeep'
import type { Periods } from '../../data/teamStats'
import { playerPath } from '../../data/player'
import { formatDayMonth } from '../../lib/time'
import { counted } from '../../lib/words'
import { TeamBadge } from '../TeamBadge'
import { PlayerPhoto } from '../PlayerPhoto'
import { LineupPitch } from '../LineupPitch'

// The match page's deeper boxes (src/data/matchDeep.ts): Matchly's calculation of the result, when the clubs
// score and let in, their key players this season and the line-ups they started their latest game with.

const dec = (n: number, d = 1) => n.toLocaleString('da-DK', { minimumFractionDigits: d, maximumFractionDigits: d })
const colour = (c?: [string, string]) => (c?.[0] && c[0].toLowerCase() !== '#ffffff' ? c[0] : (c?.[1] ?? 'var(--ink)'))

function TeamHead({ match }: { match: Match }) {
  return (
    <div className="mx-teams">
      <span>
        <TeamBadge link={false} name={match.home.name} src={match.home.badge} colors={match.home.colors} size={22} />
        {match.home.name}
      </span>
      <span>
        {match.away.name}
        <TeamBadge link={false} name={match.away.name} src={match.away.badge} colors={match.away.colors} size={22} />
      </span>
    </div>
  )
}

export function WinChanceBox({ match, chance, id }: { match: Match; chance: WinChance; id?: string }) {
  const parts = [
    { key: 'home', label: match.home.name, pct: chance.home, colour: colour(match.home.colors) },
    { key: 'draw', label: 'Uafgjort', pct: chance.draw, colour: '#c9ccc2' },
    { key: 'away', label: match.away.name, pct: chance.away, colour: colour(match.away.colors) },
  ]
  return (
    <section className="sheet__section mx-chance" id={id} aria-labelledby="mx-chance-title">
      <h2 id="mx-chance-title" className="sheet__title">
        Matchly-beregning
      </h2>
      <div className="mx-chance__nums">
        {parts.map((p) => (
          <div key={p.key} className={`mx-chance__num mx-chance__num--${p.key}`}>
            <b>{p.pct}%</b>
            <span>{p.key === 'draw' ? 'Uafgjort' : p.label}</span>
          </div>
        ))}
      </div>
      <div className="mx-chance__bar" role="img" aria-label={parts.map((p) => `${p.label} ${p.pct} %`).join(', ')}>
        {parts.map((p) => (
          <i key={p.key} style={{ width: `${p.pct}%`, background: p.colour }} />
        ))}
      </div>
      <dl className="mx-chance__facts">
        <div>
          <dt>Forventede mål</dt>
          <dd>
            {dec(chance.goalsHome)} – {dec(chance.goalsAway)}
          </dd>
        </div>
        <div>
          <dt>Mest sandsynlige resultater</dt>
          <dd className="mx-chance__scores">
            {chance.scores.map((s) => (
              <span key={`${s.home}-${s.away}`}>
                {s.home}-{s.away} <em>{s.pct}%</em>
              </span>
            ))}
          </dd>
        </div>
      </dl>
      <p className="muted small">
        Beregnet af Matchly ud fra de {chance.games} spillede kampe i sæsonen: holdenes mål hjemme og ude mod ligaens gennemsnit. Det er en beregning, ikke odds eller en
        forudsigelse.
      </p>
    </section>
  )
}

const QUARTERS = ['0-15', '16-30', '31-45', '46-60', '61-75', '76-90']
const valueAt = (p: Periods | undefined, q: string) => (p?.find((x) => x.period === q)?.value ?? 0) + (q === '76-90' ? (p?.find((x) => x.period === '91-105')?.value ?? 0) : 0)

function Mirror({ title, home, away, match }: { title: string; home?: Periods; away?: Periods; match: Match }) {
  const max = Math.max(1, ...QUARTERS.flatMap((q) => [valueAt(home, q), valueAt(away, q)]))
  return (
    <div className="mx-mirror">
      <h3>{title}</h3>
      {QUARTERS.map((q) => {
        const h = valueAt(home, q)
        const a = valueAt(away, q)
        return (
          <div key={q} className="mx-mirror__row">
            <span className="mx-mirror__n">{h || ''}</span>
            <span className="mx-mirror__bar mx-mirror__bar--home">
              <i style={{ width: `${(h / max) * 100}%`, background: colour(match.home.colors) }} />
            </span>
            <span className="mx-mirror__q">{q === '76-90' ? "76-90'" : `${q}'`}</span>
            <span className="mx-mirror__bar">
              <i style={{ width: `${(a / max) * 100}%`, background: colour(match.away.colors) }} />
            </span>
            <span className="mx-mirror__n">{a || ''}</span>
          </div>
        )
      })}
    </div>
  )
}

export function GoalTimingBox({ match, deep, id }: { match: Match; deep: MatchDeep; id?: string }) {
  const h = deep.teamStats?.home
  const a = deep.teamStats?.away
  if (!h || !a) return null
  return (
    <section className="sheet__section" id={id} aria-labelledby="mx-timing-title">
      <h2 id="mx-timing-title" className="sheet__title">
        Hvornår falder målene?
      </h2>
      <TeamHead match={match} />
      <Mirror title="Mål scoret pr. kvarter" home={h.goalsFor.periods} away={a.goalsFor.periods} match={match} />
      <Mirror title="Mål imod pr. kvarter" home={h.goalsAgainst.periods} away={a.goalsAgainst.periods} match={match} />
      <p className="muted small">Hele sæsonen i ligaen. Mål i overtiden tæller med i sidste kvarter.</p>
    </section>
  )
}

/** The club's standouts this season: one player per category, each once if possible */
function standouts(players: SeasonPlayer[]) {
  const used = new Set<number>()
  const pick = (label: string, by: (p: SeasonPlayer) => number, text: (p: SeasonPlayer) => string, ok: (p: SeasonPlayer) => boolean = () => true) => {
    const sorted = players.filter((p) => ok(p) && by(p) > 0).sort((a, b) => by(b) - by(a) || b.minutes - a.minutes)
    const p = sorted.find((x) => !used.has(x.id)) ?? sorted[0]
    if (!p) return undefined
    used.add(p.id)
    return { label, player: p, value: text(p) }
  }
  const maxApps = Math.max(0, ...players.map((p) => p.apps))
  return [
    pick('Topscorer', (p) => p.goals * 100 + p.assists, (p) => counted(p.goals, 'mål', 'mål')),
    pick('Flest assists', (p) => p.assists * 100 + p.goals, (p) => counted(p.assists, 'assist', 'assists')),
    pick('Flest chancer skabt', (p) => p.keyPasses, (p) => `${p.keyPasses} chancer`),
    pick('Bedste karakter', (p) => p.rating ?? 0, (p) => dec(p.rating ?? 0, 2), (p) => p.apps >= Math.max(2, Math.ceil(maxApps / 2))),
    pick('Målmand', (p) => (p.position === 'G' ? p.minutes : 0), (p) => `${counted(p.saves, 'redning', 'redninger')}`),
  ].filter((x): x is NonNullable<typeof x> => !!x)
}

export function KeyPlayersBox({ match, deep }: { match: Match; deep: MatchDeep }) {
  const teams = [
    { side: match.home, list: deep.players?.home ?? [] },
    { side: match.away, list: deep.players?.away ?? [] },
  ].filter((t) => t.list.length)
  if (!teams.length) return null
  return (
    <section className="sheet__section" id="spillere" aria-labelledby="mx-players-title">
      <h2 id="mx-players-title" className="sheet__title">
        Nøglespillere i sæsonen
      </h2>
      <div className="mx-players">
        {teams.map(({ side, list }) => (
          <div key={side.name} className="mx-players__team">
            <h3>
              <TeamBadge link={false} name={side.name} src={side.badge} colors={side.colors} size={22} />
              {side.name}
            </h3>
            <ul>
              {standouts(list).map((s) => (
                <li key={s.label}>
                  <PlayerPhoto photo={s.player.photo} team={side.name} teamLogo={side.badge} colors={side.colors} size={40} />
                  <span className="mx-players__who">
                    <em>{s.label}</em>
                    <Link href={playerPath(s.player.id, s.player.name)} rel="nofollow" prefetch={false}>
                      {s.player.name}
                    </Link>
                  </span>
                  <b>{s.value}</b>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="muted small">Ligakampe i sæsonen. Karakter: gennemsnit for spillere med mindst halvdelen af holdets kampe.</p>
    </section>
  )
}

export function ExpectedLineupsBox({ match, xi }: { match: Match; xi: { home?: LastXI; away?: LastXI } }) {
  if (!xi.home || !xi.away) return null
  const note = (x: LastXI, team: string) => `${team}: ${x.home ? 'hjemme' : 'ude'} mod ${x.against} ${formatDayMonth(x.date)}${x.lineup.formation ? ` (${x.lineup.formation})` : ''}`
  return (
    <section className="sheet__section" id="opstilling" aria-labelledby="mx-xi-title">
      <h2 id="mx-xi-title" className="sheet__title">
        Seneste startopstillinger
      </h2>
      <p className="muted small">Holdene, som de startede deres seneste kamp. De rigtige opstillinger kommer cirka en time før kampstart.</p>
      {/* Only the starting eleven: the bench of a game already played says little about this one */}
      <LineupPitch lineups={[{ ...xi.home.lineup, team: match.home.name, substitutes: [] }, { ...xi.away.lineup, team: match.away.name, substitutes: [] }]} />
      <p className="muted small">
        {note(xi.home, match.home.name)} · {note(xi.away, match.away.name)}
      </p>
    </section>
  )
}
