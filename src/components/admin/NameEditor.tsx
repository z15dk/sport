'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/** Shows a club's name and lets an admin change it (empty = back to the original) */
export function NameEditor({
  slug,
  name,
  originalName,
  endpoint = '/api/admin/club-name',
}: {
  slug: string
  name: string
  originalName?: string
  /** Where the name is saved (clubs by default) */
  endpoint?: string
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const renamed = !!originalName && originalName !== name

  const save = async (next: string) => {
    setBusy(true)
    setError(undefined)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, name: next }),
      })
      const body = (await res.json()) as { error?: string }
      if (!res.ok) setError(body.error ?? 'Noget gik galt')
      else {
        setEditing(false)
        router.refresh()
      }
    } catch {
      setError('Kunne ikke nå serveren')
    } finally {
      setBusy(false)
    }
  }

  if (!editing) {
    return (
      <span className="name-editor">
        <strong>{name}</strong>
        <button
          className="text-btn"
          onClick={() => {
            setValue(name)
            setEditing(true)
          }}
        >
          Ret navn
        </button>
        {renamed && (
          <>
            <em className="name-editor__original">Oprindeligt: {originalName}</em>
            <button className="text-btn" disabled={busy} onClick={() => void save('')}>
              Gendan
            </button>
          </>
        )}
      </span>
    )
  }
  return (
    <form
      className="name-editor name-editor--edit"
      onSubmit={(e) => {
        e.preventDefault()
        void save(value)
      }}
    >
      <input value={value} onChange={(e) => setValue(e.target.value)} maxLength={60} autoFocus aria-label="Navn" disabled={busy} />
      <button className="pill is-active" type="submit" disabled={busy || !value.trim()}>
        {busy ? 'Gemmer …' : 'Gem'}
      </button>
      <button className="text-btn" type="button" onClick={() => setEditing(false)} disabled={busy}>
        Annuller
      </button>
      {error && (
        <span className="logo-editor__error" role="alert">
          {error}
        </span>
      )}
    </form>
  )
}
