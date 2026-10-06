'use client'

import { useState } from 'react'

// "Index Now" (as in Rank Math): sends pages to IndexNow – Bing, Yandex and the rest – at once (/api/admin/indexnow)

async function send(paths: string[]): Promise<{ text: string; error?: boolean }> {
  const res = await fetch('/api/admin/indexnow', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ paths }) }).catch(() => undefined)
  const r = ((await res?.json().catch(() => ({}))) ?? {}) as { count?: number; status?: number; skipped?: number; error?: string }
  if (!res?.ok || r.error) return { text: r.error ?? 'Det gik ikke', error: true }
  return { text: `Sendt: ${r.count} ${r.count === 1 ? 'side' : 'sider'} (svar ${r.status})${r.skipped ? ` · ${r.skipped} sprunget over` : ''}` }
}

/** One button for one or a few pages (the article editor, the admin bar); `compact` keeps the answer in the button itself (the admin bar has one line) */
export function IndexNowButton({ paths, className = 'text-btn', label = 'Index Now', compact }: { paths: string[]; className?: string; label?: string; compact?: boolean }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; error?: boolean }>()
  const button = (
    <button
      type="button"
      className={className}
      disabled={busy}
      title={msg?.text ?? 'Fortæl Bing, Yandex m.fl. om siden med det samme (IndexNow)'}
      onClick={async () => {
        setBusy(true)
        setMsg(await send(paths))
        setBusy(false)
      }}
    >
      ⚡ {busy ? 'Sender …' : compact && msg ? (msg.error ? 'Index Now fejlede' : 'Sendt ✓') : label}
    </button>
  )
  if (compact) return button
  return (
    <span className="indexnow-btn" style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
      {button}
      {msg && <small className={msg.error ? 'is-error' : 'muted'}>{msg.text}</small>}
    </span>
  )
}

/** Many pages at once: one address or path per line (the growth page) */
export function IndexNowForm() {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; error?: boolean }>()
  const lines = text.split(/\s+/).filter(Boolean)
  return (
    <form
      className="indexnow-form"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        const r = await send(lines)
        setMsg(r)
        if (!r.error) setText('')
        setBusy(false)
      }}
    >
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder={'https://matchly.dk/turnering/2-division\n/artikler/optakt-vanloese-holbaek-2026-10-10'} />
      <div className="indexnow-form__row">
        <button type="submit" className="pill is-active" disabled={busy || !lines.length}>
          ⚡ {busy ? 'Sender …' : `Index Now${lines.length ? ` (${lines.length})` : ''}`}
        </button>
        {msg && <span className={`small ${msg.error ? 'is-error' : 'muted'}`}>{msg.text}</span>}
      </div>
    </form>
  )
}
