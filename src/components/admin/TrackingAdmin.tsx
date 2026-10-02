'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// /admin/indstillinger → Sporing: the Google Analytics and Meta Pixel ids (src/lib/tracking.ts)
export function TrackingAdmin({ ga, metaPixel, metaVerify, owner }: { ga?: string; metaPixel?: string; metaVerify?: string; owner?: { name?: string; cvr?: string; address?: string; email?: string } }) {
  const router = useRouter()
  const [g, setG] = useState(ga ?? '')
  const [p, setP] = useState(metaPixel ?? '')
  const [mv, setMv] = useState(metaVerify ?? '')
  const [o, setO] = useState({ name: owner?.name ?? '', cvr: owner?.cvr ?? '', address: owner?.address ?? '', email: owner?.email ?? '' })
  const field = (k: keyof typeof o) => ({ value: o[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setO((x) => ({ ...x, [k]: e.target.value })) })
  const [msg, setMsg] = useState<{ text: string; error?: boolean }>()
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    setMsg(undefined)
    const res = await fetch('/api/admin/tracking', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ga: g, metaPixel: p, metaVerify: mv, owner: o }) }).catch(() => undefined)
    const r = (await res?.json().catch(() => ({}))) as { error?: string } | undefined
    setBusy(false)
    if (res?.ok) {
      setMsg({ text: 'Gemt' })
      router.refresh()
    } else setMsg({ text: r?.error ?? 'Det gik ikke', error: true })
  }

  return (
    <form
      className="tracking-form"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <label>
        Google Analytics 4 (måle-id)
        <input value={g} onChange={(e) => setG(e.target.value)} placeholder="G-ABC123XYZ" />
      </label>
      <label>
        Meta Pixel (pixel-id)
        <input value={p} onChange={(e) => setP(e.target.value)} placeholder="123456789012345" inputMode="numeric" />
      </label>
      <label>
        Meta domænebekræftelse (valgfri)
        <input value={mv} onChange={(e) => setMv(e.target.value)} placeholder='kode eller <meta name="facebook-domain-verification" …>' />
      </label>
      <fieldset className="tracking-form__owner">
        <legend>Dataansvarlig (vises på /privatliv)</legend>
        <label>
          Firma / navn
          <input {...field('name')} placeholder="Matchly ApS" />
        </label>
        <label>
          CVR
          <input {...field('cvr')} placeholder="12345678" inputMode="numeric" />
        </label>
        <label>
          Adresse
          <input {...field('address')} placeholder="Gade 1, 8000 Aarhus C" />
        </label>
        <label>
          Kontakt-mail
          <input {...field('email')} type="email" placeholder="privatliv@matchly.dk" />
        </label>
      </fieldset>
      <button type="submit" className="pill is-active" disabled={busy}>
        Gem
      </button>
      {msg && <span className={`small${msg.error ? ' is-error' : ' muted'}`}>{msg.text}</span>}
    </form>
  )
}
