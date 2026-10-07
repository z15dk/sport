'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

// "Det er rigtigt" on a datavagt finding (or "Fortryd" on one marked as fine): /api/admin/datavagt, then the page again

export function DatavagtButton({ id, undo }: { id: string; undo?: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
      <button
        type="button"
        className="text-btn"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          setError(undefined)
          const res = await fetch('/api/admin/datavagt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: undo ? 'undismiss' : 'dismiss', id }) }).catch(() => undefined)
          const r = ((await res?.json().catch(() => ({}))) ?? {}) as { error?: string }
          if (!res?.ok || r.error) setError(r.error ?? 'Det gik ikke')
          else router.refresh()
          setBusy(false)
        }}
      >
        {busy ? '…' : undo ? 'Fortryd' : '✓ Det er rigtigt'}
      </button>
      {error && <small className="is-error">{error}</small>}
    </span>
  )
}
