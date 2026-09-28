'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Row {
  id: string
  name: string
  url: string
  enabled: boolean
  fetchedAt?: string
  items?: number
  error?: string
}

/** The news feeds (src/lib/news.ts): on/off, remove, add */
export function NewsFeedsAdmin({ feeds }: { feeds: Row[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')

  async function send(action: Record<string, unknown>) {
    setBusy(true)
    setError(undefined)
    const res = await fetch('/api/admin/news-feeds', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(action),
    }).catch(() => undefined)
    setBusy(false)
    if (!res?.ok) {
      setError(((await res?.json().catch(() => ({}))) as { error?: string })?.error ?? 'Kunne ikke gemme')
      return false
    }
    router.refresh()
    return true
  }

  return (
    <div className="news-admin">
      <ul className="news-admin__list">
        {feeds.map((f) => (
          <li key={f.id} className={`news-admin__row${f.enabled ? '' : ' is-off'}`}>
            <button
              type="button"
              role="switch"
              aria-checked={f.enabled}
              aria-label={`${f.name} til/fra`}
              className={`switch-toggle${f.enabled ? ' is-on' : ''}`}
              onClick={() => send({ type: 'toggle', id: f.id, enabled: !f.enabled })}
              disabled={busy}
            >
              <span className="switch-toggle__knob" />
            </button>
            <span className="news-admin__text">
              <strong>{f.name}</strong>
              <a className="news-admin__url" href={f.url} target="_blank" rel="noopener noreferrer">
                {f.url}
              </a>
              <span className={`news-admin__status${!f.enabled ? '' : f.error ? ' is-error' : f.fetchedAt ? ' is-ok' : ''}`}>
                {!f.enabled ? 'Slået fra' : f.error ? `Fejl: ${f.error}` : f.fetchedAt ? `Hentet ${f.fetchedAt} · ${f.items} artikler` : 'Ikke hentet endnu'}
              </span>
            </span>
            <button type="button" className="text-btn" disabled={busy} onClick={() => confirm(`Fjern ${f.name}?`) && send({ type: 'remove', id: f.id })}>
              Fjern
            </button>
          </li>
        ))}
      </ul>
      <form
        className="admin-filter news-admin__add"
        onSubmit={async (e) => {
          e.preventDefault()
          if (await send({ type: 'add', name, url })) {
            setName('')
            setUrl('')
          }
        }}
      >
        <input className="news-admin__name" placeholder="Navn, fx Bold" aria-label="Kildens navn" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required />
        <input placeholder="https://…/feed" aria-label="Feedets adresse" value={url} onChange={(e) => setUrl(e.target.value)} type="url" required />
        <button className="pill is-active" type="submit" disabled={busy}>
          Tilføj kilde
        </button>
      </form>
      {error && (
        <p className="unverified" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
