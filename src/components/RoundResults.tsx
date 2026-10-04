import type { Division } from '../data/leagues'
import { allFixtures, toMatch, type Fixture } from '../data/season'
import { formatDayMonth, isoDate } from '../lib/time'
import { MatchRow } from './MatchRow'

// A league's matches by round: the coming round on top when no round is being
// played (e.g. in an international break), then the latest round that has begun
// and the one before it, older rounds folded away. A match played well after the rest of
// its round (postponed) stays under its own round, marked as played later.

const DAY = 86_400_000
/** How far from the rest of its round a match may be played before it counts as postponed */
const POSTPONED_AFTER = 4 * DAY

interface Round {
  n: number
  main: Fixture[]
  later: Fixture[]
  /** Not begun yet: the next round, shown on top */
  next?: boolean
}

/**
 * The rounds that have begun, newest first, with the coming round in front when every match of the
 * latest round has kicked off; undefined when the league's matches have no round numbers
 */
export function roundsOf(division: Division, now: number): Round[] | undefined {
  const fixtures = allFixtures().filter((f) => f.division?.id === division.id)
  if (!fixtures.length || fixtures.some((f) => !f.round)) return undefined
  const byRound = new Map<number, Fixture[]>()
  for (const f of fixtures) byRound.set(f.round, [...(byRound.get(f.round) ?? []), f])
  const rounds: Round[] = []
  let next: Round | undefined
  for (const [n, list] of byRound) {
    const sorted = [...list].sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime())
    if (!list.some((f) => f.kickoff.getTime() <= now)) {
      if (!next || n < next.n) next = { n, main: sorted, later: [], next: true }
      continue
    }
    // The round's own weekend: the middle match; matches far from it were moved
    const middle = sorted[Math.floor(sorted.length / 2)].kickoff.getTime()
    const main = sorted.filter((f) => Math.abs(f.kickoff.getTime() - middle) <= POSTPONED_AFTER)
    rounds.push({ n, main, later: sorted.filter((f) => !main.includes(f)) })
  }
  rounds.sort((a, b) => b.n - a.n)
  // The latest round still has matches to come: that round is the current one, and stays on top
  const current = rounds[0]
  if (next && (!current || current.main.every((f) => f.kickoff.getTime() <= now))) rounds.unshift(next)
  return rounds
}

/** "25.–27. sep." for the days a round's matches are played */
function days(list: Fixture[]) {
  const first = isoDate(list[0].kickoff)
  const last = isoDate(list[list.length - 1].kickoff)
  if (first === last) return formatDayMonth(first)
  const [a, b] = [formatDayMonth(first), formatDayMonth(last)]
  // Same month: "25.–27. sep."
  const monthA = a.split(' ').slice(1).join(' ')
  const monthB = b.split(' ').slice(1).join(' ')
  return monthA === monthB ? `${a.split(' ')[0]}–${b}` : `${a} – ${b}`
}

function RoundSection({ round, now }: { round: Round; now: number }) {
  return (
    <section className="league">
      <header className="league__header">
        <div className="league__toggle">
          <span className="league__titles">
            {round.main.length > 0 && (
              <span className="league__country">
                {round.next && 'Næste runde · '}
                {days(round.main)}
              </span>
            )}
            <h2 className="league__name">{round.n}. runde</h2>
          </span>
        </div>
      </header>
      <ul className="league__matches">
        {round.main.map((f) => (
          <MatchRow key={f.id} match={toMatch(f, now)} showDate />
        ))}
        {round.later.length > 0 && <li className="league__note">Udsat og spillet senere</li>}
        {round.later.map((f) => (
          <MatchRow key={f.id} match={toMatch(f, now)} showDate />
        ))}
      </ul>
    </section>
  )
}

/** The coming round (if shown) and the latest two rounds open, the rest behind "Vis tidligere runder" */
export function RoundResults({ rounds, now }: { rounds: Round[]; now: number }) {
  const shown = rounds[0]?.next ? 3 : 2
  const [open, older] = [rounds.slice(0, shown), rounds.slice(shown)]
  return (
    <>
      {open.map((r) => (
        <RoundSection key={r.n} round={r} now={now} />
      ))}
      {older.length > 0 && (
        <details className="rounds-older">
          <summary>Vis tidligere runder ({older.length})</summary>
          {older.map((r) => (
            <RoundSection key={r.n} round={r} now={now} />
          ))}
        </details>
      )}
    </>
  )
}
