'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

/** Upload or reset one club's logo */
export function LogoEditor({ slug, name, uploaded }: { slug: string; name: string; uploaded: boolean }) {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const send = async (init: RequestInit, url = '/api/admin/logo') => {
    setBusy(true)
    setError(undefined)
    try {
      const res = await fetch(url, init)
      const body = (await res.json()) as { error?: string }
      if (!res.ok) setError(body.error ?? 'Noget gik galt')
      else router.refresh()
    } catch {
      setError('Kunne ikke nå serveren')
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  const upload = (file: File) => {
    const form = new FormData()
    form.set('slug', slug)
    form.set('file', file)
    void send({ method: 'POST', body: form })
  }

  return (
    <span className="logo-editor">
      <label className={`pill${busy ? ' is-busy' : ''}`}>
        {busy ? 'Gemmer …' : 'Upload logo'}
        <input
          ref={input}
          className="visually-hidden"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          disabled={busy}
          aria-label={`Upload logo for ${name}`}
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
        />
      </label>
      {uploaded && (
        <button
          className="text-btn"
          disabled={busy}
          onClick={() => confirm(`Fjern det uploadede logo for ${name}?`) && void send({ method: 'DELETE' }, `/api/admin/logo?slug=${encodeURIComponent(slug)}`)}
        >
          Nulstil
        </button>
      )}
      {error && (
        <span className="logo-editor__error" role="alert">
          {error}
        </span>
      )}
    </span>
  )
}
