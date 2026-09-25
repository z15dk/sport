'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/** The link a channel's logo goes to; empty removes it */
export function LinkEditor({ id, url }: { id: string; url?: string }) {
  const router = useRouter()
  const [value, setValue] = useState(url ?? '')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string }>()

  const save = async () => {
    setBusy(true)
    setMessage(undefined)
    try {
      const res = await fetch('/api/admin/channel-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, url: value }),
      })
      const body = (await res.json()) as { error?: string }
      if (!res.ok) setMessage({ ok: false, text: body.error ?? 'Noget gik galt' })
      else {
        setMessage({ ok: true, text: value.trim() ? 'Gemt' : 'Link fjernet' })
        router.refresh()
      }
    } catch {
      setMessage({ ok: false, text: 'Kunne ikke nå serveren' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="link-editor"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <input
        type="url"
        inputMode="url"
        placeholder="https://… (link på logoet)"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label="Link på logoet"
        disabled={busy}
      />
      <button className="pill is-active" type="submit" disabled={busy}>
        {busy ? 'Gemmer …' : 'Gem link'}
      </button>
      {message && (
        <span className={message.ok ? 'link-editor__ok' : 'logo-editor__error'} role="status">
          {message.text}
        </span>
      )}
    </form>
  )
}
