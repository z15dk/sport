'use client'

import { useState } from 'react'

// The week's task as a checklist on /admin/vaekst: each tick is saved at once (src/lib/growth.ts)

export function GrowthChecklist({ task, steps, done }: { task: string; steps: { id: string; text: string; by?: 'claude' | 'dig'; done?: string }[]; done: Record<string, string> }) {
  const [ticks, setTicks] = useState(done)
  const [error, setError] = useState<string>()

  async function toggle(id: string) {
    const on = !ticks[id]
    setTicks((t) => {
      const next = { ...t }
      if (on) next[id] = new Date().toISOString()
      else delete next[id]
      return next
    })
    setError(undefined)
    const res = await fetch('/api/admin/vaekst', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ task, step: id, done: on }) }).catch(() => undefined)
    if (!res?.ok) {
      setError('Kunne ikke gemme – prøv igen')
      setTicks(done)
    }
  }

  const count = steps.filter((s) => ticks[s.id]).length
  return (
    <div className="growth-check">
      <div className="growth-check__bar" aria-label={`${count} af ${steps.length} trin klaret`}>
        <i style={{ width: `${steps.length ? (count / steps.length) * 100 : 0}%` }} />
      </div>
      <ul>
        {steps.map((s) => (
          <li key={s.id} className={`${ticks[s.id] ? 'is-done' : ''}${s.by === 'claude' ? ' is-claude' : ''}`}>
            <label>
              {/* A step Claude has done stays done (it is in the task file, not the admin's ticks) */}
              <input type="checkbox" checked={!!ticks[s.id]} disabled={s.by === 'claude' && !!s.done} onChange={() => void toggle(s.id)} />
              <span>{s.text}</span>
              <em className={`growth-check__who growth-check__who--${s.by === 'claude' ? 'claude' : 'dig'}`}>{s.by === 'claude' ? 'James' : 'Dig'}</em>
            </label>
          </li>
        ))}
      </ul>
      <p className="muted small">
        {count} af {steps.length} trin klaret{error && <span className="is-error"> · {error}</span>}
      </p>
    </div>
  )
}
