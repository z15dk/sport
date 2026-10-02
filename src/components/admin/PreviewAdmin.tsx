'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/** Makes (or updates) match preview drafts: one match, or every match in the next days */
export function PreviewButton({ keys, days, label, primary }: { keys?: string[]; days?: number; label: string; primary?: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string>()
  return (
    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <button
        type="button"
        className={primary ? 'pill is-active' : 'pill'}
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          setMsg(undefined)
          const res = await fetch('/api/admin/previews', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(keys ? { keys } : { days }) }).catch(() => undefined)
          const out = (await res?.json().catch(() => ({}))) as { made?: number; skipped?: number; errors?: { error: string }[] } | undefined
          setBusy(false)
          setMsg(out?.errors?.length ? `Fejl: ${out.errors[0].error}` : `${out?.made ?? 0} kladde${out?.made === 1 ? '' : 'r'} gemt${out?.skipped ? `, ${out.skipped} allerede udgivet` : ''}`)
          router.refresh()
        }}
      >
        {busy ? 'Skriver …' : label}
      </button>
      {msg && <span className="muted small">{msg}</span>}
    </span>
  )
}
