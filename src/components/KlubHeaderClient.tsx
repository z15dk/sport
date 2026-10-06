'use client'

import { useFavoriteTeams } from '../hooks/useFavoriteTeams'
import { useNow } from '../hooks/useNow'

// The two parts of the club page's header (KlubHeader) that run in the browser:
// the follow button (the visitor's own teams, kept in the browser) and the countdown.

/** "Følg klubben": the same teams as "Mine hold" and the follow buttons elsewhere (useFavoriteTeams) */
export function KlubFollow({ slug, name, what = 'klubben' }: { slug: string; name: string; what?: 'klubben' | 'holdet' }) {
  const { follows, toggle, loaded } = useFavoriteTeams()
  const on = loaded && follows(slug)
  return (
    <button type="button" className={`kh-follow${on ? ' is-on' : ''}`} aria-pressed={on} onClick={() => toggle(slug)} title={on ? `Følg ikke længere ${name}` : `Følg ${name}, så står ${what} øverst på forsiden`}>
      {on ? 'Følger' : `Følg ${what}`}
    </button>
  )
}

const DAY = 86_400_000
const HOUR = 3_600_000

/** "2 dage 5 timer" until kick-off; nothing a week or more ahead, or once the match has started */
function countdownText(ms: number): string | undefined {
  if (ms <= 0 || ms >= 7 * DAY) return undefined
  const days = Math.floor(ms / DAY)
  const hours = Math.floor((ms % DAY) / HOUR)
  if (!days && !hours) return `${Math.max(1, Math.floor(ms / 60_000))} min.`
  return [days ? `${days} ${days === 1 ? 'dag' : 'dage'}` : '', hours ? `${hours} ${hours === 1 ? 'time' : 'timer'}` : ''].filter(Boolean).join(' ')
}

/** "Kampstart om": counted down in the browser, from the same clock the server drew the page with */
export function KlubCountdown({ kickoff, initialNow }: { kickoff: number; initialNow: number }) {
  const now = useNow(60_000, initialNow)
  const text = countdownText(kickoff - now)
  if (!text) return null
  return (
    <div className="kh-extra">
      <span className="kh-label">Kampstart om</span>
      <span className="kh-text">{text}</span>
    </div>
  )
}
