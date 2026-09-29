'use client'

import { useState } from 'react'

interface Row {
  api: string
  label: string
  ok: boolean
  plan?: string
  active?: boolean
  end?: string
  used?: number
  limit?: number
  error?: string
}

/** "Test forbindelsen": asks API-Sports' /status for each sport (costs no calls) */
export function ApiStatusCheck() {
  const [rows, setRows] = useState<Row[]>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [at, setAt] = useState<string>()
  return (
    <div className="api-check">
      <button
        type="button"
        className="pill is-active"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          setError(undefined)
          const res = await fetch('/api/admin/apisports-status', { method: 'POST' }).catch(() => undefined)
          const body = (await res?.json().catch(() => undefined)) as { status?: Row[]; error?: string } | undefined
          setBusy(false)
          if (!body?.status) setError(body?.error ?? 'Ingen forbindelse til serveren')
          else {
            setRows(body.status)
            setAt(new Date().toLocaleTimeString('da-DK', { timeZone: 'Europe/Copenhagen', hour: '2-digit', minute: '2-digit' }))
          }
        }}
      >
        {busy ? 'Tester …' : 'Test forbindelsen'}
      </button>
      {error && <p className="unverified">{error}</p>}
      {rows && (
        <ul className="api-check__list">
          {rows
            .filter((r) => r.error !== 'Ingen nøgle')
            .map((r) => (
              <li key={r.api} className={r.ok ? 'is-ok' : 'is-error'}>
                <strong>
                  {r.ok ? '✓' : '✗'} {r.label}
                </strong>{' '}
                {r.ok
                  ? `virker · ${r.plan ?? 'ukendt plan'}${r.end ? ` til ${r.end.slice(0, 10)}` : ''} · ${r.used ?? '?'} af ${r.limit ?? '?'} kald brugt i dag${
                      r.used !== undefined && r.limit ? ` (${r.limit - r.used} tilbage)` : ''
                    }`
                  : `fejl: ${r.error}`}
              </li>
            ))}
          {rows.every((r) => r.error === 'Ingen nøgle') && <li className="is-error">Ingen nøgler i serverens env.</li>}
          <li className="muted small">Testet kl. {at}. Testen koster ingen kald.</li>
        </ul>
      )}
    </div>
  )
}
