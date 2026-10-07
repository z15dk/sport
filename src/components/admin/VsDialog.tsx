'use client'

import { useEffect, useState } from 'react'
import { ArchivePicker } from './ArticlePhotos'

// The VS graphic maker in the article editor: two clubs, a line on top and a photo behind them
// (from the archive or an upload), shown live as it will look; "Lav grafik" makes the 1200×630
// picture on the server and it becomes the article's picture. Also one club's logo, or one league's.

type Kind = 'vs' | 'club' | 'league'
const TITLE: Record<Kind, string> = { vs: 'Lav VS-grafik', club: 'Lav klubbillede', league: 'Lav ligabillede' }

export function VsDialog({ onDone, onClose }: { onDone: (url: string, alt: string) => void; onClose: () => void }) {
  const [clubs, setClubs] = useState<string[]>([])
  const [leagues, setLeagues] = useState<string[]>([])
  // Two clubs (VS), one club (only its logo) or one league (its logo and name)
  const [kind, setKind] = useState<Kind>('vs')
  const one = kind !== 'vs'
  const names = kind === 'league' ? leagues : clubs
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
      .then((d: { clubs?: string[]; leagues?: string[] }) => {
        setClubs(d.clubs ?? [])
        setLeagues(d.leagues ?? [])
      })
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
    const r = await fetch('/api/admin/vs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(kind === 'league' ? { league: home } : one ? { club: home } : { home, away, top, bg }) })
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
    if (r.url) onDone(r.url, one ? home : `${home} mod ${away}`)
    else setError(r.error ?? 'Grafikken kunne ikke laves')
  }

  // The live preview: the finished picture itself, drawn by the server (a moment after the last keystroke)
  const ready = one ? names.includes(home) : clubs.includes(home) && clubs.includes(away)
  const query = !ready ? undefined : kind === 'league' ? new URLSearchParams({ liga: home }).toString() : one ? new URLSearchParams({ klub: home }).toString() : new URLSearchParams({ h: home, a: away, ...(top && { top }), ...(bg && { bg }) }).toString()
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
    <div className="vsd" role="dialog" aria-modal="true" aria-label={TITLE[kind]}>
      <div className="vsd__panel">
        <header className="vsd__head">
          <h2>{TITLE[kind]}</h2>
          <button type="button" className="text-btn" onClick={onClose}>
            Luk
          </button>
        </header>
        <datalist id="vs-clubs">
          {names.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <div className="vsd__bg-actions" role="group" aria-label="Slags grafik">
          {(['vs', 'club', 'league'] as const).map((k) => (
            <button
              key={k}
              type="button"
              className={`pill${kind === k ? ' is-active' : ''}`}
              aria-pressed={kind === k}
              onClick={() => {
                // A club's name is no league's: start over when switching between them
                if ((k === 'league') !== (kind === 'league')) setHome('')
                setKind(k)
              }}
            >
              {k === 'vs' ? 'To klubber (VS)' : k === 'club' ? 'Én klub (logo)' : 'Liga (logo)'}
            </button>
          ))}
        </div>
        <div className="vsd__grid">
          <label>
            <span>{kind === 'league' ? 'Liga' : one ? 'Klub' : 'Hjemmehold'}</span>
            <input list="vs-clubs" value={home} onChange={(e) => setHome(e.target.value)} placeholder={kind === 'league' ? 'Skriv ligaens navn …' : 'Skriv klubbens navn …'} />
          </label>
          {!one && (
            <>
              <label>
                <span>Udehold</span>
                <input list="vs-clubs" value={away} onChange={(e) => setAway(e.target.value)} placeholder="Skriv klubbens navn …" />
              </label>
              <label className="vsd__wide">
                <span>Linje øverst (valgfri)</span>
                <input value={top} onChange={(e) => setTop(e.target.value)} maxLength={120} placeholder="Fx SHL · lør. 3/10 kl. 15.15 · Malmö Arena" />
              </label>
            </>
          )}
        </div>
        {/* One club or league: only its logo, no background photo */}
        <div className="vsd__bg" hidden={one}>
          <span>Baggrundsbillede (valgfrit)</span>
          <div className="vsd__bg-actions">
            <button type="button" className="pill" onClick={() => setArchive(true)} disabled={busy}>
              Vælg fra billedarkivet
            </button>
            <label className="pill">
              Upload billede
              <input type="file" accept="image/*" hidden onChange={(e) => void upload(e.target.files?.[0])} />
            </label>
            {busy && !ready && <span className="muted small">Lægger billedet op …</span>}
            {bg && (
              <>
                {/* The chosen picture, so it is plain that one is chosen */}
                {/* eslint-disable-next-line @next/next/no-img-element -- an upload of our own */}
                <img className="vsd__bg-thumb" src={bg} alt="Valgt baggrund" />
                <button type="button" className="text-btn" onClick={() => setBg(undefined)}>
                  Fjern baggrund
                </button>
              </>
            )}
          </div>
          <small className="muted">Billedet gøres mørkere bag logoerne, så de står tydeligt.</small>
          {/* The graphic is credited "Matchly.dk", so a photo behind it must be one we may use without naming anyone else */}
          <small className="vsd__rights">Brug kun billeder, I selv har taget eller har købt ret til. Grafikken krediteres Matchly.dk, så fotografen bliver ikke nævnt – klubbers og mediers billeder må ikke bruges her.</small>
        </div>
        <div className={`vsd__preview${loading ? ' is-loading' : ''}`}>
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- the server's own picture, shown as it is
            <img
              src={preview}
              alt={kind === 'league' ? 'Forhåndsvisning af ligabilledet' : one ? 'Forhåndsvisning af klubbilledet' : 'Forhåndsvisning af VS-grafikken'}
              width={1200}
              height={630}
              onLoad={() => setLoading(false)}
              onError={() => {
                setLoading(false)
                setError('Forhåndsvisningen kunne ikke tegnes')
              }}
            />
          ) : bg && !one ? (
            // Before the clubs are chosen: the background as it will sit behind them
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- an upload of our own */}
              <img className="vsd__bg-only" src={bg} alt="Valgt baggrund" />
              <p className="vsd__hint small">Baggrunden er valgt – vælg to klubber fra listen for at se hele grafikken.</p>
            </>
          ) : (
            <p className="muted small">{kind === 'league' ? 'Vælg en liga fra listen for at se billedet.' : one ? 'Vælg en klub fra listen for at se billedet.' : 'Vælg to klubber fra listen for at se grafikken.'}</p>
          )}
        </div>
        {error && <p className="small social-msg is-error">{error}</p>}
        <p>
          <button type="button" className="pill is-active" disabled={!ready || busy} onClick={() => void make()}>
            {busy ? 'Arbejder …' : one ? 'Lav billede og brug det' : 'Lav grafik og brug den'}
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
