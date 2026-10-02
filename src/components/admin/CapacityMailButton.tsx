'use client'

import { useState } from 'react'

interface Result {
  from: string
  to: string
  accepted: string[]
  rejected: string[]
  response: string
  messageId: string
}

/** "Send prøvemail": mails the capacity report now (/api/admin/capacity) and shows what the SMTP server answered, so the owner knows the warning will arrive – or where it stops */
export function CapacityMailButton({ to }: { to: string }) {
  const [state, setState] = useState<{ busy?: boolean; result?: Result; error?: string }>({})
  const r = state.result
  return (
    <div className="api-check">
      <button
        type="button"
        className="pill is-active"
        disabled={state.busy}
        onClick={async () => {
          setState({ busy: true })
          const res = await fetch('/api/admin/capacity', { method: 'POST' }).catch(() => undefined)
          const body = (await res?.json().catch(() => undefined)) as { ok?: boolean; result?: Result; error?: string } | undefined
          setState(body?.ok && body.result ? { result: body.result } : { error: body?.error ?? (res ? `Serveren svarede ${res.status}` : 'Ingen forbindelse til serveren') })
        }}
      >
        {state.busy ? 'Sender …' : 'Send prøvemail'}
      </button>
      {r && (
        <p className="small">
          {r.rejected.length ? <span className="is-bad">SMTP-serveren afviste {r.rejected.join(', ')}.</span> : <>SMTP-serveren tog imod mailen til {r.accepted.join(', ') || to}.</>} Afsender {r.from}.
          {r.response && (
            <>
              {' '}
              Svar: <code>{r.response}</code>.
            </>
          )}{' '}
          <span className="muted">Kommer den ikke frem, så kig i spam/uønsket post – og afsenderens domæne skal tillade SMTP-serveren at sende for sig (SPF), ellers sorterer modtageren den fra.</span>
        </p>
      )}
      {state.error && <p className="unverified">{state.error}</p>}
    </div>
  )
}
