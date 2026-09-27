'use client'

import { useFavoriteTeams } from '../hooks/useFavoriteTeams'

/** "Follow" a team: it gets a card at the top of the front page */
export function FollowButton({ slug, name }: { slug: string; name: string }) {
  const { follows, toggle, loaded } = useFavoriteTeams()
  const on = loaded && follows(slug)
  return (
    <button
      type="button"
      className={`follow-btn${on ? ' is-on' : ''}`}
      aria-pressed={on}
      onClick={() => toggle(slug)}
      title={on ? `Følg ikke længere ${name}` : `Følg ${name} – vises øverst på forsiden`}
    >
      {on ? '★ Følger' : '☆ Følg'}
    </button>
  )
}
