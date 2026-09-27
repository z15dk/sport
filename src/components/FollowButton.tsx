'use client'

import { useFavoriteTeams } from '../hooks/useFavoriteTeams'
import { GoalAlertToggle } from './GoalAlertToggle'

/** "Follow" a team: it gets a card at the top of the front page */
export function FollowButton({ slug, name }: { slug: string; name: string }) {
  const { follows, toggle, loaded } = useFavoriteTeams()
  const on = loaded && follows(slug)
  return (
    <span className="follow-wrap">
    <button
      type="button"
      className={`follow-btn${on ? ' is-on' : ''}`}
      aria-pressed={on}
      onClick={() => toggle(slug)}
      title={on ? `Følg ikke længere ${name}` : `Følg ${name} – vises øverst på forsiden`}
    >
      {on ? '★ Følger' : '☆ Følg'}
    </button>
    {on && <GoalAlertToggle compact />}
    </span>
  )
}
