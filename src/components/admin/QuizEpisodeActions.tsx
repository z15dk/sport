'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

// One quiz episode's buttons on /admin/sociale/quiz: download the video, mark it posted (or not), remove the newest

export function QuizEpisodeActions({ n, posted, newest, hasVideo }: { n: number; posted: boolean; newest: boolean; hasVideo: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const send = async (body: Record<string, unknown>) => {
    setBusy(true)
    setError(undefined)
    const res = await fetch('/api/admin/quiz', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, n }) }).catch(() => undefined)
    const r = ((await res?.json().catch(() => ({}))) ?? {}) as { error?: string }
    setBusy(false)
    if (!res?.ok || r.error) setError(r.error ?? 'Det gik ikke')
    else router.refresh()
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
      {hasVideo && (
        <a className="pill is-active" href={`/api/admin/quiz/video/${n}?download=1`}>
          Download video
        </a>
      )}
      <button type="button" className="pill" disabled={busy} onClick={() => void send({ action: 'posted', posted: !posted })}>
        {posted ? 'Fortryd: ikke lagt op' : 'Marker som lagt op'}
      </button>
      {newest && !posted && (
        <button
          type="button"
          className="text-btn"
          disabled={busy}
          onClick={() => {
            if (confirm(`Slet afsnit ${n}? James laver et nyt ved næste runde.`)) void send({ action: 'remove' })
          }}
        >
          Slet afsnittet
        </button>
      )}
      {error && <small className="is-error">{error}</small>}
    </div>
  )
}
