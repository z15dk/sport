'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/** An on/off switch for a site setting, saved right away */
export function SettingToggle({ name, label, value }: { name: string; label: string; value: boolean }) {
  const router = useRouter()
  const [on, setOn] = useState(value)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  async function toggle() {
    setBusy(true)
    setError(undefined)
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: name, value: !on }),
    }).catch(() => undefined)
    setBusy(false)
    if (!res?.ok) {
      setError(((await res?.json().catch(() => ({}))) as { error?: string })?.error ?? 'Kunne ikke gemme')
      return
    }
    setOn(!on)
    router.refresh()
  }

  return (
    <div className="setting">
      <button type="button" role="switch" aria-checked={on} className={`switch-toggle${on ? ' is-on' : ''}`} onClick={toggle} disabled={busy}>
        <span className="switch-toggle__knob" />
      </button>
      <span>
        {label}: <strong>{on ? 'Slået til' : 'Slået fra'}</strong>
      </span>
      {error && (
        <span className="unverified" role="alert">
          {error}
        </span>
      )}
    </div>
  )
}
