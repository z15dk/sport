'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// /admin/billetter: the ticket links (src/lib/tickets.ts) – one field per club,
// and lists of tournament rules, match exceptions and partner codes.

type Kind = 'club' | 'league' | 'match' | 'partner'

async function save(kind: Kind, key: string, value: string | null) {
  const res = await fetch('/api/admin/tickets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind, key, value }) })
  const r = (await res.json().catch(() => ({}))) as { error?: string }
  if (res.status === 401) throw new Error('Du er logget ud – log ind igen')
  if (!res.ok) throw new Error(r.error ?? `Det gik ikke (fejl ${res.status})`)
}

/** A club's ticket link: its own (saved here), the one we found, or none */
export function ClubTicketField({ id, name, saved, found }: { id: string; name: string; saved?: string; found?: string }) {
  const router = useRouter()
  const current = saved ?? found ?? ''
  const [value, setValue] = useState(current)
  const [msg, setMsg] = useState<{ text: string; error?: boolean }>()
  const [busy, setBusy] = useState(false)
  const state = saved === '' ? 'none' : saved ? 'own' : found ? 'found' : 'missing'
  const label = { own: 'Rettet af dig', found: 'Fundet af Matchly', none: 'Ingen billetsalg', missing: 'Mangler' }[state]

  async function run(v: string | null, done: string) {
    setBusy(true)
    setMsg(undefined)
    try {
      await save('club', id, v)
      setMsg({ text: done })
      router.refresh()
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : String(e), error: true })
    }
    setBusy(false)
  }

  return (
    <li className={`ticket-row is-${state}`}>
      <span className="ticket-row__name">
        <strong>{name}</strong>
        <span className={`ticket-row__state is-${state}`}>{label}</span>
      </span>
      <form
        className="ticket-row__form"
        onSubmit={(e) => {
          e.preventDefault()
          run(value.trim(), value.trim() ? 'Gemt' : 'Gemt uden billetsalg')
        }}
      >
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="https://billet.klub.dk" inputMode="url" aria-label={`Billetlink for ${name}`} />
        <button type="submit" className="pill is-active" disabled={busy || value.trim() === current}>
          Gem
        </button>
        {saved !== undefined && (
          <button type="button" className="pill" disabled={busy} onClick={() => run(null, found ? 'Tilbage til det fundne link' : 'Nulstillet')} title={found ? `Tilbage til ${found}` : 'Fjern dit link'}>
            Nulstil
          </button>
        )}
        {current && (
          <a className="small" href={current} target="_blank" rel="noopener noreferrer">
            Åbn ↗
          </a>
        )}
      </form>
      {msg && <span className={`small${msg.error ? ' is-error' : ' muted'}`}>{msg.text}</span>}
    </li>
  )
}

/** A list of key → value (tournament rules, match exceptions, partner codes) with a form to add one */
export function TicketList({ kind, entries, keyLabel, keyPlaceholder, valueLabel, valuePlaceholder, emptyMeans }: { kind: Exclude<Kind, 'club'>; entries: { key: string; value: string; note?: string }[]; keyLabel: string; keyPlaceholder: string; valueLabel: string; valuePlaceholder: string; emptyMeans?: string }) {
  const router = useRouter()
  const [key, setKey] = useState('')
  const [value, setValue] = useState('')
  const [msg, setMsg] = useState<{ text: string; error?: boolean }>()

  async function run(k: string, v: string | null, done: string) {
    setMsg(undefined)
    try {
      await save(kind, k, v)
      setMsg({ text: done })
      if (v !== null) {
        setKey('')
        setValue('')
      }
      router.refresh()
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : String(e), error: true })
    }
  }

  return (
    <div className="ticket-list">
      {entries.length > 0 && (
        <ul className="admin-list">
          {entries.map((e) => (
            <li key={e.key} className="ticket-list__row">
              <span>
                <strong>{e.key}</strong> → {e.value || <em className="muted">{emptyMeans ?? 'ingen'}</em>}
                {e.note && <span className="muted small"> · {e.note}</span>}
              </span>
              <button type="button" className="pill" onClick={() => run(e.key, null, 'Fjernet')}>
                Fjern
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="ticket-list__form"
        onSubmit={(e) => {
          e.preventDefault()
          if (key.trim()) run(key.trim(), value.trim(), 'Gemt')
        }}
      >
        <label>
          {keyLabel}
          <input value={key} onChange={(e) => setKey(e.target.value)} placeholder={keyPlaceholder} />
        </label>
        <label>
          {valueLabel}
          <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={valuePlaceholder} />
        </label>
        <button type="submit" className="pill is-active" disabled={!key.trim()}>
          Tilføj
        </button>
      </form>
      {msg && <p className={`small${msg.error ? ' is-error' : ' muted'}`}>{msg.text}</p>}
    </div>
  )
}
