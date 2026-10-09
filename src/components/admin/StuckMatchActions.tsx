'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

// A stuck match in the data guard ("Kampe der hænger"): type its result, have it fetched again from the source,
// or hide it from the site (/api/admin/datavagt). A correction shows on the site when the data is merged next.

export function StuckMatchActions({ game, label }: { game: string; label: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [home, setHome] = useState('')
  const [away, setAway] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; error?: boolean }>()

  const send = async (body: Record<string, unknown>, done: string) => {
    setBusy(true)
    setMsg(undefined)
    const res = await fetch('/api/admin/datavagt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, game, label }) }).catch(() => undefined)
    const r = ((await res?.json().catch(() => ({}))) ?? {}) as { error?: string }
    setBusy(false)
    if (!res?.ok || r.error) return setMsg({ text: r.error ?? 'Det gik ikke', error: true })
    setMsg({ text: done })
    setOpen(false)
    router.refresh()
  }

  const valid = /^\d{1,2}$/.test(home) && /^\d{1,2}$/.test(away)
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
      {open ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <input aria-label="Hjemmeholdets mål" inputMode="numeric" value={home} onChange={(e) => setHome(e.target.value.trim())} style={{ width: 44, textAlign: 'center' }} autoFocus />
          <span>–</span>
          <input aria-label="Udeholdets mål" inputMode="numeric" value={away} onChange={(e) => setAway(e.target.value.trim())} style={{ width: 44, textAlign: 'center' }} />
          <button type="button" className="pill is-active" disabled={!valid || busy} onClick={() => void send({ action: 'matchResult', home: Number(home), away: Number(away) }, `Resultatet ${home}-${away} er gemt – det står på sitet om lidt`)}>
            Gem
          </button>
          <button type="button" className="text-btn" onClick={() => setOpen(false)}>
            Annullér
          </button>
        </span>
      ) : (
        <span style={{ display: 'inline-flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: '4px 14px' }}>
          <button type="button" className="text-btn" disabled={busy} onClick={() => setOpen(true)}>
            Indtast resultat
          </button>
          <button type="button" className="text-btn" disabled={busy} onClick={() => void send({ action: 'matchRefetch' }, 'Kampens dag hentes igen fra kilden inden for et par minutter')}>
            Hent igen
          </button>
          <button
            type="button"
            className="text-btn"
            disabled={busy}
            onClick={() => {
              if (confirm('Skjul kampen på hele sitet? Det kan fortrydes under "Rettede kampe".')) void send({ action: 'matchHide' }, 'Kampen er skjult – den forsvinder fra sitet om lidt')
            }}
          >
            Skjul kampen
          </button>
        </span>
      )}
      {msg && <small className={msg.error ? 'is-error' : 'muted'}>{msg.text}</small>}
    </span>
  )
}

/** "Fortryd" on a corrected match: back to what the source says */
export function ResetMatchButton({ game }: { game: string }) {
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
          const res = await fetch('/api/admin/datavagt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'matchReset', game }) }).catch(() => undefined)
          const r = ((await res?.json().catch(() => ({}))) ?? {}) as { error?: string }
          if (!res?.ok || r.error) setError(r.error ?? 'Det gik ikke')
          else router.refresh()
          setBusy(false)
        }}
      >
        {busy ? '…' : 'Fortryd'}
      </button>
      {error && <small className="is-error">{error}</small>}
    </span>
  )
}
