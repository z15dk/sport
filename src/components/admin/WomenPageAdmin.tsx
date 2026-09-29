'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { WomenHero } from '../WomenHero'

// /admin/kvindesport: the women's sport pages' top – picture (upload, remove,
// which part to show), the heading's two lines and the text – with a preview.

interface Page {
  image?: string
  position: 'top' | 'center' | 'bottom'
  title1: string
  title2: string
  lead: string
}

export function WomenPageAdmin({ page, defaultLead, numbers }: { page: Page; defaultLead: string; numbers: { liveNow: number; todayCount: number; played: number; leagues: number; sports: number } }) {
  const router = useRouter()
  const [p, setP] = useState(page)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; error?: boolean }>()
  const file = useRef<HTMLInputElement>(null)
  const set = <K extends keyof Page>(k: K, v: Page[K]) => setP((x) => ({ ...x, [k]: v }))

  async function send(body: FormData | Record<string, unknown>, done: string) {
    setBusy(true)
    setMsg(undefined)
    try {
      const res = await fetch('/api/admin/women-page', {
        method: 'POST',
        ...(body instanceof FormData ? { body } : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      })
      const r = (await res.json().catch(() => ({}))) as { page?: Page; error?: string }
      if (!res.ok || !r.page) throw new Error(r.error ?? 'Det gik ikke')
      setP(r.page)
      setMsg({ text: done })
      router.refresh()
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : String(e), error: true })
    } finally {
      setBusy(false)
    }
  }

  function upload() {
    const f = file.current?.files?.[0]
    if (!f) return
    const form = new FormData()
    form.set('file', f)
    send(form, 'Billedet er lagt op og vises nu på siden').finally(() => {
      if (file.current) file.current.value = ''
    })
  }

  const hero = (
    <WomenHero
      preview
      kicker="Matchly · Kvinder i sport"
      title1={p.title1 || 'Hun spiller.'}
      title2={p.title2}
      lead={p.lead || defaultLead}
      image={p.image}
      position={p.position}
      liveHref="#"
      liveNow={numbers.liveNow}
      todayCount={numbers.todayCount}
      numbers={[
        { label: 'Kampe i dag', value: numbers.todayCount },
        { label: 'Spillet de sidste 14 dage', value: numbers.played },
        { label: 'Turneringer', value: numbers.leagues },
        { label: 'Sportsgrene', value: numbers.sports },
      ]}
    />
  )

  return (
    <div className="women-admin">
      <section className="panel">
        <h2 className="panel__title">Billede</h2>
        <p className="muted small pad">
          Liggende billede i 2:1, helst 2400 × 1200 px (jpg, png, webp; max 10 MB). Placér motivet i højre halvdel – på computeren står teksten til venstre; på mobil vises hele billedet øverst. Det lægges bag teksten med en mørk tone i venstre side, så teksten
          altid kan læses. Brug kun billeder, du har ret til at bruge.
        </p>
        <div className="women-admin__buttons">
          <input ref={file} type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={upload} disabled={busy} aria-label="Vælg billede" />
          {p.image && (
            <button type="button" className="pill" disabled={busy} onClick={() => send({ image: null }, 'Billedet er fjernet')}>
              Fjern billedet
            </button>
          )}
          <label className="small">
            Udsnit{' '}
            <select value={p.position} disabled={busy || !p.image} onChange={(e) => send({ position: e.target.value }, 'Udsnittet er gemt')}>
              <option value="top">Toppen af billedet</option>
              <option value="center">Midten</option>
              <option value="bottom">Bunden af billedet</option>
            </select>
          </label>
        </div>
      </section>

      <section className="panel">
        <h2 className="panel__title">Tekst</h2>
        <form
          className="women-admin__form"
          onSubmit={(e) => {
            e.preventDefault()
            send({ title1: p.title1, title2: p.title2, lead: p.lead }, 'Teksten er gemt')
          }}
        >
          <label>
            Overskrift, linje 1 (hvid)
            <input value={p.title1} maxLength={40} onChange={(e) => set('title1', e.target.value)} />
          </label>
          <label>
            Overskrift, linje 2 (grøn)
            <input value={p.title2} maxLength={40} onChange={(e) => set('title2', e.target.value)} />
          </label>
          <label className="is-wide">
            Tekst under overskriften (tom = sidens egen tekst for hver sport)
            <textarea rows={3} maxLength={300} value={p.lead} placeholder={defaultLead} onChange={(e) => set('lead', e.target.value)} />
          </label>
          <div className="is-wide">
            <button type="submit" className="pill is-active" disabled={busy}>
              {busy ? 'Gemmer …' : 'Gem teksten'}
            </button>
          </div>
        </form>
      </section>

      {msg && (
        <p className={`social-msg${msg.error ? ' is-error' : ''}`} role="status">
          {msg.text}
        </p>
      )}

      <h2>Forhåndsvisning</h2>
      <div className="women-admin__preview">{hero}</div>
      <p className="muted small">
        På mobil står billedet øverst og teksten under. Se siden på telefonen:{' '}
        <a href="/kvindesport" target="_blank" rel="noreferrer">
          matchly.dk/kvindesport
        </a>
      </p>
    </div>
  )
}
