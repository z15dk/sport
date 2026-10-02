'use client'

import { useState } from 'react'

/** "Vil I være med?" on /billetsystem: the club's name and contact, saved for /admin/billetter */
export function LeadForm() {
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  if (sent) return <p className="bs-contact__done">Tak! Vi vender tilbage hurtigst muligt.</p>
  return (
    <form
      className="bs-form"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        setError(undefined)
        const data = Object.fromEntries(new FormData(e.currentTarget))
        const res = await fetch('/api/billetsystem/kontakt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) }).catch(() => undefined)
        const r = (await res?.json().catch(() => ({}))) as { ok?: boolean; error?: string } | undefined
        setBusy(false)
        if (res?.ok && r?.ok) setSent(true)
        else setError(r?.error ?? 'Det gik ikke – prøv igen')
      }}
    >
      <label>
        Klub
        <input name="club" required maxLength={120} placeholder="Fx Brønshøj BK" />
      </label>
      <label>
        Dit navn
        <input name="name" maxLength={120} />
      </label>
      <label>
        Mail
        <input name="email" type="email" required maxLength={160} />
      </label>
      <label>
        Telefon
        <input name="phone" type="tel" maxLength={40} />
      </label>
      <label className="bs-form__wide">
        Besked (valgfri)
        <textarea name="message" rows={3} maxLength={2000} placeholder="Fx antal tilskuere, og hvordan I sælger billetter i dag" />
      </label>
      <input name="website" tabIndex={-1} autoComplete="off" className="bs-form__trap" aria-hidden="true" />
      <div className="bs-form__wide">
        <button type="submit" className="wg-btn wg-btn--lime" disabled={busy}>
          {busy ? 'Sender …' : 'Send'}
        </button>
        {error && <span className="is-error small"> {error}</span>}
      </div>
    </form>
  )
}
