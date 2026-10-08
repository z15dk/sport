'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

// "Tjek nu" on /admin/datavagt: runs the checks at once (/api/admin/datavagt, action run), then the page again

export function DatavagtRunButton() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  return (
    <span className="dv-run">
      <button
        type="button"
        className="pill is-active"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          setError(undefined)
          const res = await fetch('/api/admin/datavagt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'run' }) }).catch(() => undefined)
          const r = ((await res?.json().catch(() => ({}))) ?? {}) as { error?: string }
          if (!res?.ok || r.error) setError(r.error ?? 'Det gik ikke')
          else router.refresh()
          setBusy(false)
        }}
      >
        {busy ? 'Tjekker …' : 'Tjek nu'}
      </button>
      {error && <small className="is-error">{error}</small>}
    </span>
  )
}
