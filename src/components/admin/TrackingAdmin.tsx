'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// /admin/indstillinger → Sporing: the Google Analytics and Meta Pixel ids (src/lib/tracking.ts)
export function TrackingAdmin({ ga, metaPixel }: { ga?: string; metaPixel?: string }) {
  const router = useRouter()
  const [g, setG] = useState(ga ?? '')
  const [p, setP] = useState(metaPixel ?? '')
  const [msg, setMsg] = useState<{ text: string; error?: boolean }>()
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    setMsg(undefined)
    const res = await fetch('/api/admin/tracking', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ga: g, metaPixel: p }) }).catch(() => undefined)
    const r = (await res?.json().catch(() => ({}))) as { error?: string } | undefined
    setBusy(false)
    if (res?.ok) {
      setMsg({ text: 'Gemt' })
      router.refresh()
    } else setMsg({ text: r?.error ?? 'Det gik ikke', error: true })
  }

  return (
    <form
      className="tracking-form"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <label>
        Google Analytics 4 (måle-id)
        <input value={g} onChange={(e) => setG(e.target.value)} placeholder="G-ABC123XYZ" />
      </label>
      <label>
        Meta Pixel (pixel-id)
        <input value={p} onChange={(e) => setP(e.target.value)} placeholder="123456789012345" inputMode="numeric" />
      </label>
      <button type="submit" className="pill is-active" disabled={busy}>
        Gem
      </button>
      {msg && <span className={`small${msg.error ? ' is-error' : ' muted'}`}>{msg.text}</span>}
    </form>
  )
}
