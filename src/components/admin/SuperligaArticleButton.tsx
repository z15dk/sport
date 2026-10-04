'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/** Writes (or updates) Superliga articles as drafts: one kind, or all three */
export function SuperligaArticleButton({ kinds, label, primary }: { kinds?: string[]; label: string; primary?: boolean }) {
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
          const res = await fetch('/api/admin/superliga-artikler', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(kinds ? { kinds } : {}) }).catch(() => undefined)
          const out = (await res?.json().catch(() => ({}))) as { made?: number; skipped?: number; error?: string; errors?: { error: string }[] } | undefined
          setBusy(false)
          setMsg(out?.error ? `Fejl: ${out.error}` : out?.errors?.length ? `Fejl: ${out.errors[0].error}` : `${out?.made ?? 0} kladde${out?.made === 1 ? '' : 'r'} gemt${out?.skipped ? `, ${out.skipped} allerede udgivet` : ''}`)
          router.refresh()
        }}
      >
        {busy ? 'Skriver …' : label}
      </button>
      {msg && <span className="muted small">{msg}</span>}
    </span>
  )
}
