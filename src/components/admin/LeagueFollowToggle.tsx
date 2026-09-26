'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/** Switches an API-Sports league on or off for our job; "standard" is the built-in list */
export function LeagueFollowToggle({ api, id, followed, choice }: { api: string; id: string; followed: boolean; choice?: 'on' | 'off' }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  async function save(next: 'on' | 'off' | null) {
    setBusy(true)
    setError(undefined)
    const res = await fetch('/api/admin/league-follow', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ api, id, choice: next }),
    }).catch(() => undefined)
    setBusy(false)
    if (!res?.ok) return setError('Kunne ikke gemme')
    router.refresh()
  }

  return (
    <span className="follow-toggle">
      <button
        type="button"
        role="switch"
        aria-checked={followed}
        className={`switch-toggle${followed ? ' is-on' : ''}`}
        disabled={busy}
        onClick={() => save(followed ? 'off' : 'on')}
        title={followed ? 'Hentes – klik for at stoppe' : 'Hentes ikke – klik for at hente'}
      >
        <span className="switch-toggle__knob" />
      </button>
      <span className="follow-toggle__text">
        {followed ? 'Hentes' : 'Hentes ikke'}
        {choice ? (
          <button type="button" className="text-btn" disabled={busy} onClick={() => save(null)} title="Tilbage til standardlisten">
            nulstil
          </button>
        ) : (
          <em>standard</em>
        )}
      </span>
      {error && <span className="unverified">{error}</span>}
    </span>
  )
}
