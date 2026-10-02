'use client'

import { useState } from 'react'

/** "Send prøvemail": mails the capacity report now (/api/admin/capacity), so the owner knows the warning will arrive */
export function CapacityMailButton({ to }: { to: string }) {
  const [state, setState] = useState<{ busy?: boolean; ok?: boolean; error?: string }>({})
  return (
    <div className="api-check">
      <button
        type="button"
        className="pill is-active"
        disabled={state.busy}
        onClick={async () => {
          setState({ busy: true })
          const res = await fetch('/api/admin/capacity', { method: 'POST' }).catch(() => undefined)
          const body = (await res?.json().catch(() => undefined)) as { ok?: boolean; error?: string } | undefined
          setState(body?.ok ? { ok: true } : { error: body?.error ?? 'Ingen forbindelse til serveren' })
        }}
      >
        {state.busy ? 'Sender …' : 'Send prøvemail'}
      </button>
      {state.ok && <p className="small">Sendt til {to}.</p>}
      {state.error && <p className="unverified">{state.error}</p>}
    </div>
  )
}
