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
  const set = (id: string, d: number) =>
    setQty((q) => ({
      ...q,
      [id]: Math.max(0, Math.min(20, (q[id] ?? 0) + d)),
    }))

  async function buy() {
    setBusy(true)
    setError(undefined)
    const res = await fetch('/api/billetsystem/ordre', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kamp: match, quantities: qty, name, email }),
    }).catch(() => undefined)
    const r = (await res?.json().catch(() => ({}))) as { id?: string; error?: string } | undefined
    if (res?.ok && r?.id) router.push(`/billetsystem/demo/ordre/${r.id}`)
    else {
      setBusy(false)
      setError(r?.error ?? 'Det gik ikke – prøv igen')
    }
  }

  const lines = types.filter((t) => qty[t.id])

  return (
    <div className="bs-buy">
      <div className="bs-buy__main">
        <section className="bs-step">
          <h2 className="bs-step__title">
            <b>1</b> Vælg billetter
          </h2>
          <ul className="bs-types">
            {types.map((t) => (
              <li key={t.id} className={qty[t.id] ? 'is-picked' : ''}>
                <span className="bs-types__name">
                  <strong>{t.label}</strong>
                  <span>{t.price ? `+ ${kr(t.fee)} gebyr` : 'Ingen gebyr'}</span>
                </span>
                <span className="bs-types__price">{t.price ? kr(t.price) : 'Gratis'}</span>
                <span className="bs-qty">
                  <button type="button" onClick={() => set(t.id, -1)} disabled={!qty[t.id]} aria-label={`Færre ${t.label}`}>
                    −
                  </button>
                  <output aria-live="polite">{qty[t.id] ?? 0}</output>
                  <button type="button" onClick={() => set(t.id, 1)} disabled={(qty[t.id] ?? 0) >= 20} aria-label={`Flere ${t.label}`}>
                    +
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section className="bs-step">
          <h2 className="bs-step__title">
            <b>2</b> Dine oplysninger
          </h2>
          <div className="bs-fields">
            <label>
              <span>Navn</span>
              <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Fornavn og efternavn" />
            </label>
            <label>
              <span>Mail</span>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" placeholder="navn@mail.dk" />
            </label>
          </div>
          <p className="bs-step__note">Billetterne sendes til din mail og kan lægges i Wallet.</p>
        </section>
      </div>
      <aside className="bs-summary">
        <h2 className="bs-step__title">
          <b>3</b> Din ordre
        </h2>
        <ul className="bs-summary__lines">
          {lines.length ? (
            lines.map((t) => (
              <li key={t.id}>
                <span>
                  {qty[t.id]} × {t.label}
                </span>
                <span>{kr(qty[t.id] * t.price)}</span>
              </li>
            ))
          ) : (
            <li className="is-empty">Vælg mindst én billet</li>
          )}
          {fees > 0 && (
            <li className="is-fee">
              <span>Gebyr</span>
              <span>{kr(fees)}</span>
            </li>
          )}
        </ul>
        <div className="bs-summary__total">
          <span>I alt</span>
          <strong>{kr(tickets + fees)}</strong>
        </div>
        <button type="button" className="wg-btn wg-btn--lime bs-buy__go" onClick={buy} disabled={busy || count === 0}>
          {busy ? 'Køber …' : count === 0 ? 'Vælg billetter' : `Køb ${count === 1 ? 'billet' : `${count} billetter`}`}
        </button>
        <div className="bs-summary__methods" aria-label="Betalingsmåder">
          <span>MobilePay</span>
          <span>Apple Pay</span>
          <span>Google Pay</span>
          <span>Kort</span>
        </div>
        <p className="bs-summary__note">Demo – der trækkes ingen penge.</p>
        {error && <p className="is-error small">{error}</p>}
      </aside>
    </div>
  )
}
