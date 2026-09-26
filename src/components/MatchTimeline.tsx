import type { Incident, Match } from '../types'

/** Regular playing time per sport, in minutes; sports without a running clock get no timeline */
const LENGTH: Partial<Record<Match['sport'], number>> = { soccer: 90, ice_hockey: 60, handball: 60 }

/** The minute a live match has reached, from its status ("78'", "Pause", "2. periode") */
function currentMinute(match: Match, length: number): number | undefined {
  if (match.state === 'finished') return length
  if (match.state !== 'live') return undefined
  const label = match.statusLabel ?? ''
  const m = /(\d+)/.exec(label)
  if (/'/.test(label) && m) return Math.min(Number(m[1]), length + 15)
  if (/pause/i.test(label)) return length / 2
  if (/(\d)\.\s*periode/i.test(label)) return (Number(/(\d)\./.exec(label)![1]) - 1) * 20 + 10
  return undefined
}

const ICON: Record<Incident['kind'], string> = { goal: '⚽', penalty: '⚽', 'own-goal': '⚽', yellow: '', red: '' }
const WORD: Record<Incident['kind'], string> = { goal: 'Mål', penalty: 'Mål (straffe)', 'own-goal': 'Selvmål', yellow: 'Gult kort', red: 'Rødt kort' }

/**
 * The match as a line from kick-off to the final whistle: filled up to the
 * minute a live match has reached, with goals (home above, away below) and
 * cards at the minute they came.
 */
export function MatchTimeline({ match }: { match: Match }) {
  const length = LENGTH[match.sport]
  if (!length || (match.state !== 'live' && match.state !== 'finished')) return null
  const minute = currentMinute(match, length)
  const incidents = match.incidents ?? []
  const end = Math.max(length, minute ?? 0, ...incidents.map((i) => i.minute))
  const at = (min: number) => `${Math.min(100, (min / end) * 100)}%`
  // An own goal counts for the other side, so it sits with the side it counts for
  const sideOf = (i: Incident) => (i.kind === 'own-goal' ? (i.side === 'home' ? 'away' : 'home') : i.side)
  const marks = [0, length / 2, length]

  return (
    <section className="timeline-graphic" aria-label="Kampens forløb">
      <div className="timeline-graphic__teams">
        <span>{match.home.name}</span>
        {match.state === 'live' && minute !== undefined && <span className="timeline-graphic__now">{match.statusLabel}</span>}
        <span>{match.away.name}</span>
      </div>
      <div className="timeline-graphic__track">
        <div className="timeline-graphic__rail">
          <div className={`timeline-graphic__fill${match.state === 'live' ? ' is-live' : ''}`} style={{ width: at(minute ?? 0) }} />
          {marks.map((m) => (
            <span key={m} className="timeline-graphic__tick" style={{ left: at(m) }}>
              {m}&apos;
            </span>
          ))}
        </div>
        {incidents.map((i, n) => (
          <span
            key={n}
            className={`timeline-graphic__event timeline-graphic__event--${sideOf(i)} timeline-graphic__event--${i.kind}`}
            style={{ left: at(i.minute) }}
            title={`${i.minute}' ${WORD[i.kind]}${i.player ? ` – ${i.player}` : ''}`}
          >
            {i.kind === 'yellow' || i.kind === 'red' ? <span className={i.kind === 'red' ? 'red-card' : 'yellow-card'} aria-hidden /> : <span aria-hidden>{ICON[i.kind]}</span>}
            <em>{i.minute}&apos;</em>
            <span className="visually-hidden">
              {WORD[i.kind]} {i.side === 'home' ? match.home.name : match.away.name}
              {i.player ? `, ${i.player}` : ''}
            </span>
          </span>
        ))}
      </div>
      {incidents.length === 0 && <p className="muted small">Ingen mål eller kort registreret endnu.</p>}
    </section>
  )
}
