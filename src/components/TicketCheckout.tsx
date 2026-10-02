'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// The checkout (/billetsystem/demo/<kamp>): how many of each ticket type, the total with the fee
// included (shown before paying, as the law asks), name and mail, and "Køb" – in the demo no money is taken.

interface Type {
  id: string
  label: string
  price: number
  fee: number
}

const kr = (n: number) => `${n.toLocaleString('da-DK', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })} kr.`

export function TicketCheckout({ match, types }: { match: string; types: Type[] }) {
  const router = useRouter()
  const [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries(types.map((t, i) => [t.id, i === 0 ? 2 : 0])))
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const count = types.reduce((n, t) => n + (qty[t.id] ?? 0), 0)
  const tickets = types.reduce((n, t) => n + (qty[t.id] ?? 0) * t.price, 0)
  const fees = Math.round(types.reduce((n, t) => n + (qty[t.id] ?? 0) * t.fee, 0) * 100) / 100
  const set = (id: string, d: number) => setQty((q) => ({ ...q, [id]: Math.max(0, Math.min(10, (q[id] ?? 0) + d)) }))

  async function buy() {
    setBusy(true)
    setError(undefined)
    const res = await fetch('/api/billetsystem/ordre', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kamp: match, quantities: qty, name, email }) }).catch(() => undefined)
    const r = (await res?.json().catch(() => ({}))) as { id?: string; error?: string } | undefined
    if (res?.ok && r?.id) router.push(`/billetsystem/demo/ordre/${r.id}`)
    else {
      setBusy(false)
      setError(r?.error ?? 'Det gik ikke – prøv igen')
    }
  }

  return (
    <div className="bs-buy">
      <section className="panel bs-buy__types">
        <h2 className="panel__title">Billetter</h2>
        <ul>
          {types.map((t) => (
            <li key={t.id}>
              <span>
                <strong>{t.label}</strong>
                <span className="muted small">{t.price ? `${kr(t.price)} + ${kr(t.fee)} gebyr` : 'Gratis'}</span>
              </span>
              <span className="bs-qty">
                <button type="button" onClick={() => set(t.id, -1)} disabled={!qty[t.id]} aria-label={`Færre ${t.label}`}>
                  −
                </button>
                <output aria-live="polite">{qty[t.id] ?? 0}</output>
                <button type="button" onClick={() => set(t.id, 1)} disabled={(qty[t.id] ?? 0) >= 10} aria-label={`Flere ${t.label}`}>
                  +
                </button>
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section className="panel bs-buy__pay">
        <h2 className="panel__title">Betaling</h2>
        <label>
          Navn
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </label>
        <label>
          Mail (billetterne sendes hertil)
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" />
        </label>
        <dl className="bs-buy__sum">
          <div>
            <dt>{count === 1 ? '1 billet' : `${count} billetter`}</dt>
            <dd>{kr(tickets)}</dd>
          </div>
          <div>
            <dt>Gebyr</dt>
            <dd>{kr(fees)}</dd>
          </div>
          <div className="is-total">
            <dt>I alt</dt>
            <dd>{kr(tickets + fees)}</dd>
          </div>
        </dl>
        <div className="bs-buy__methods" aria-label="Betalingsmåder">
          <span>Kort</span>
          <span>MobilePay</span>
          <span>Apple Pay</span>
          <span>Google Pay</span>
        </div>
        <button type="button" className="wg-btn wg-btn--lime bs-buy__go" onClick={buy} disabled={busy || count === 0}>
          {busy ? 'Køber …' : `Køb ${count === 1 ? 'billet' : 'billetter'} · ${kr(tickets + fees)}`}
        </button>
        <p className="muted small">Demo: der trækkes ingen penge. I den rigtige version betales der her med kort eller MobilePay.</p>
        {error && <p className="is-error small">{error}</p>}
      </section>
    </div>
  )
}
