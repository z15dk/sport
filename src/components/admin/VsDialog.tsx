'use client'

import { useEffect, useState } from 'react'
import { ArchivePicker } from './ArticlePhotos'

// The VS graphic maker in the article editor: two clubs, a line on top and a photo behind them
// (from the archive or an upload), shown live as it will look; "Lav grafik" makes the 1200×630
// picture on the server and it becomes the article's picture.

export function VsDialog({ onDone, onClose }: { onDone: (url: string, alt: string) => void; onClose: () => void }) {
  const [clubs, setClubs] = useState<string[]>([])
  const [home, setHome] = useState('')
  const [away, setAway] = useState('')
  const [top, setTop] = useState('')
  const [bg, setBg] = useState<string>()
  const [archive, setArchive] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  useEffect(() => {
    void fetch('/api/admin/vs', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { clubs?: string[] }) => setClubs(d.clubs ?? []))
      .catch(() => undefined)
  }, [])

  const upload = async (file?: File) => {
    if (!file) return
    setBusy(true)
    setError(undefined)
    const form = new FormData()
    form.set('file', file)
    const r = await fetch('/api/admin/upload', { method: 'POST', body: form })
      .then((x) => x.json())
      .catch(() => ({ error: 'Ingen forbindelse' }))
    setBusy(false)
    if (r.url) setBg(r.url)
    else setError(r.error ?? 'Billedet kunne ikke lægges op')
  }

  const make = async () => {
    setBusy(true)
    setError(undefined)
    const r = await fetch('/api/admin/vs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ home, away, top, bg }) })
      .then(async (x) => {
        const text = await x.text()
        try {
          return JSON.parse(text) as { url?: string; error?: string }
        } catch {
          // Not our answer (a proxy's error page, a timeout)
          return { error: `Serveren svarede ${x.status} uden et billede – prøv igen` }
        }
      })
      .catch((): { url?: string; error?: string } => ({ error: 'Ingen forbindelse til serveren' }))
    setBusy(false)
    if (r.url) onDone(r.url, `${home} mod ${away}`)
    else setError(r.error ?? 'Grafikken kunne ikke laves')
  }

  // The live preview: the finished picture itself, drawn by the server (a moment after the last keystroke)
  const ready = clubs.includes(home) && clubs.includes(away)
  const query = ready ? new URLSearchParams({ h: home, a: away, ...(top && { top }), ...(bg && { bg }) }).toString() : undefined
  const [preview, setPreview] = useState<string>()
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!query) {
      setPreview(undefined)
      return
    }
    setLoading(true)
    const t = setTimeout(() => setPreview(`/api/admin/vs/billede?${query}`), 400)
    return () => clearTimeout(t)
  }, [query])

  return (
    <div className="vsd" role="dialog" aria-modal="true" aria-label="Lav VS-grafik">
      <div className="vsd__panel">
        <header className="vsd__head">
          <h2>Lav VS-grafik</h2>
          <button type="button" className="text-btn" onClick={onClose}>
            Luk
          </button>
        </header>
        <datalist id="vs-clubs">
          {clubs.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <div className="vsd__grid">
          <label>
            <span>Hjemmehold</span>
            <input list="vs-clubs" value={home} onChange={(e) => setHome(e.target.value)} placeholder="Skriv klubbens navn …" />
          </label>
          <label>
            <span>Udehold</span>
            <input list="vs-clubs" value={away} onChange={(e) => setAway(e.target.value)} placeholder="Skriv klubbens navn …" />
          </label>
          <label className="vsd__wide">
            <span>Linje øverst (valgfri)</span>
            <input value={top} onChange={(e) => setTop(e.target.value)} maxLength={120} placeholder="Fx SHL · lør. 3/10 kl. 15.15 · Malmö Arena" />
          </label>
        </div>
        <div className="vsd__bg">
          <span>Baggrundsbillede (valgfrit)</span>
          <div className="vsd__bg-actions">
            <button type="button" className="pill" onClick={() => setArchive(true)} disabled={busy}>
              Vælg fra billedarkivet
            </button>
            <label className="pill">
              Upload billede
              <input type="file" accept="image/*" hidden onChange={(e) => void upload(e.target.files?.[0])} />
            </label>
            {bg && (
              <button type="button" className="text-btn" onClick={() => setBg(undefined)}>
                Fjern baggrund
              </button>
            )}
          </div>
          <small className="muted">Billedet gøres mørkere bag logoerne, så de står tydeligt.</small>
        </div>
        <div className={`vsd__preview${loading ? ' is-loading' : ''}`}>
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- the server's own picture, shown as it is
            <img
              src={preview}
              alt="Forhåndsvisning af VS-grafikken"
              width={1200}
              height={630}
              onLoad={() => setLoading(false)}
              onError={() => {
                setLoading(false)
                setError('Forhåndsvisningen kunne ikke tegnes')
              }}
            />
          ) : (
            <p className="muted small">Vælg to klubber fra listen for at se grafikken.</p>
          )}
        </div>
        {error && <p className="small social-msg is-error">{error}</p>}
        <p>
          <button type="button" className="pill is-active" disabled={!ready || busy} onClick={() => void make()}>
            {busy ? 'Arbejder …' : 'Lav grafik og brug den'}
          </button>
        </p>
      </div>
      {archive && (
        <ArchivePicker
          onClose={() => setArchive(false)}
          onPick={(p) => {
            setBg(p.url)
            setArchive(false)
          }}
        />
      )}
    </div>
  )
}
