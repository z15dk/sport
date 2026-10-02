'use client'

import { useEffect, useState } from 'react'

// The article editor's link to the photo archive (/admin/billeder):
//  - PhotoMetaDialog: right after an upload, asks for the picture's rights, loan,
//    match and alt text (the picture is already in the archive; "later" leaves it
//    in the review queue as "mangler metadata")
//  - ArchivePicker: browse the archive with the admin's search and filters and put
//    a photo into the article (a public copy is made; an expired loan is never offered)

interface Club {
  id: string
  name: string
}
interface Option {
  value: string
  label: string
  n: number
}
interface PickerPhoto {
  id: number
  title: string
  date: string | null
  status: string
  review: boolean
  players: string[]
  situation: string | null
  credit: string
  borrowed: boolean
  licenseUntil: string | null
  ready: boolean
  alt: string
}
interface PickerData {
  photos: PickerPhoto[]
  options: { clubs: Option[]; opponents: Option[]; situations: Option[]; players: Option[] }
  clubs: Club[]
  defaultCredit: string
}

const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(15,17,12,0.55)', zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '4vh 12px', overflowY: 'auto' }
const panel: React.CSSProperties = { background: 'var(--surface)', borderRadius: 14, padding: 18, width: 'min(560px, 100%)', display: 'flex', flexDirection: 'column', gap: 10 }
const field: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 }
const input: React.CSSProperties = { font: 'inherit', fontWeight: 400, fontSize: 14, padding: '7px 9px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface)' }

async function post(body: Record<string, unknown>) {
  const res = await fetch('/api/admin/photos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => undefined)
  const json = ((await res?.json().catch(() => ({}))) ?? {}) as { error?: string; url?: string; credit?: string; borrowed?: boolean }
  return res?.ok ? json : { ...json, error: json.error ?? 'Kunne ikke nå serveren' }
}

function useClubs() {
  const [data, setData] = useState<{ clubs: Club[]; defaultCredit: string }>({ clubs: [], defaultCredit: 'Matchly.dk' })
  useEffect(() => {
    void fetch('/api/admin/photos?status=ny', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: PickerData) => setData({ clubs: d.clubs, defaultCredit: d.defaultCredit }))
      .catch(() => undefined)
  }, [])
  return data
}

export function PhotoMetaDialog({ url, photoId, onDone }: { url: string; photoId?: number; onDone: (alt: string) => void }) {
  const { clubs, defaultCredit } = useClubs()
  const [alt, setAlt] = useState('')
  const [borrowed, setBorrowed] = useState(false)
  const [credit, setCredit] = useState('')
  const [until, setUntil] = useState('')
  const [club, setClub] = useState('')
  const [opp, setOpp] = useState('')
  const [date, setDate] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Copenhagen' })

  const save = async () => {
    setError(undefined)
    if (!alt.trim()) return setError('Skriv en alt-tekst – den bruges af Google og skærmlæsere')
    if (borrowed && (!credit.trim() || !until)) return setError('Et lånt billede skal have fotograf/ejer og en slutdato')
    if (photoId) {
      setBusy(true)
      const r = await post({ action: 'article-metadata', photo: photoId, credit: borrowed ? credit : credit || '', licenseUntil: borrowed ? until : '', clubId: club, opponentId: opp, date })
      setBusy(false)
      if (r.error) return setError(r.error)
    }
    onDone(alt.trim())
  }

  return (
    <div style={overlay} role="dialog" aria-modal="true" aria-label="Billedets oplysninger">
      <div style={panel}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Billedets oplysninger</h2>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>Billedet er lagt i billedarkivet. Udfyld rettigheder og kamp, så det kan findes og bruges rigtigt.</p>
        {/* eslint-disable-next-line @next/next/no-img-element -- the picture just uploaded */}
        <img src={url} alt="" style={{ maxHeight: 180, objectFit: 'contain', borderRadius: 8, background: 'var(--surface-2)' }} />
        <label style={field}>
          Alt-tekst (vises ikke, men læses af Google og skærmlæsere)
          <input style={input} value={alt} onChange={(e) => setAlt(e.target.value)} placeholder="Fx Elias Astola jubler efter 1-0 mod Skive" autoFocus />
        </label>
        <div style={{ display: 'flex', gap: 14, fontSize: 14 }}>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="radio" checked={!borrowed} onChange={() => setBorrowed(false)} /> Eget billede
          </label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="radio" checked={borrowed} onChange={() => setBorrowed(true)} /> Lånt
          </label>
        </div>
        <label style={field}>
          Foto (rettigheder)
          <input style={input} value={credit} onChange={(e) => setCredit(e.target.value)} placeholder={borrowed ? 'Fx Foto: Jens Hansen / Skive IK' : defaultCredit} />
        </label>
        {borrowed && (
          <label style={field}>
            Lånt til og med – derefter slettes billedet og fjernes automatisk fra artiklen
            <input style={input} type="date" min={today} value={until} onChange={(e) => setUntil(e.target.value)} />
          </label>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
          <label style={field}>
            Klub
            <select style={input} value={club} onChange={(e) => setClub(e.target.value)}>
              <option value="">–</option>
              {clubs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label style={field}>
            Modstander
            <select style={input} value={opp} onChange={(e) => setOpp(e.target.value)}>
              <option value="">–</option>
              {clubs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label style={field}>
            Kampdato
            <input style={input} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
        {error && <p style={{ margin: 0, color: '#a3290c', fontSize: 13, fontWeight: 600 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="pill is-active" disabled={busy} onClick={() => void save()}>
            Gem og indsæt
          </button>
          <button
            type="button"
            className="pill"
            onClick={() => {
              if (!alt.trim()) return setError('Skriv i det mindste en alt-tekst')
              onDone(alt.trim())
            }}
          >
            Udfyld resten senere
          </button>
        </div>
        <small style={{ color: 'var(--ink-3)' }}>&quot;Senere&quot; lægger billedet i Billeder → Gennemgang som &quot;mangler metadata&quot;.</small>
      </div>
    </div>
  )
}

export function ArchivePicker({ onPick, onClose }: { onPick: (p: { url: string; alt: string; credit: string; borrowed: boolean }) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [f, setF] = useState({ klub: '', modstander: '', situation: '', spiller: '', status: '' })
  const [data, setData] = useState<PickerData>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState<number>()

  useEffect(() => {
    const p = new URLSearchParams({ q, ...f })
    const t = setTimeout(() => {
      void fetch(`/api/admin/photos?${p}`, { cache: 'no-store' })
        .then((r) => r.json())
        .then((d: PickerData) => setData(d))
        .catch(() => setError('Kunne ikke hente billedarkivet'))
    }, 250)
    return () => clearTimeout(t)
  }, [q, f])

  const choose = async (p: PickerPhoto) => {
    setBusy(p.id)
    setError(undefined)
    const r = await post({ action: 'publish', photo: p.id })
    setBusy(undefined)
    if (r.error || !r.url) return setError(r.error ?? 'Billedet kunne ikke bruges')
    onPick({ url: r.url, alt: p.alt, credit: r.credit ?? data?.defaultCredit ?? 'Matchly.dk', borrowed: !!r.borrowed })
  }

  const sel = (key: keyof typeof f, label: string, options: Option[]) => (
    <select style={{ ...input, flex: '1 1 140px' }} value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value, ...(key === 'klub' ? { spiller: '' } : {}) })} aria-label={label}>
      <option value="">{label}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label} ({o.n})
        </option>
      ))}
    </select>
  )

  return (
    <div style={overlay} role="dialog" aria-modal="true" aria-label="Billedarkiv">
      <div style={{ ...panel, width: 'min(980px, 100%)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Vælg fra billedarkivet</h2>
          <button type="button" className="text-btn" onClick={onClose}>
            Luk
          </button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <input style={{ ...input, flex: '2 1 220px' }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Søg: Brabrand 9, Bryld, jubel" aria-label="Søg" autoFocus />
          {data && sel('klub', 'Alle klubber', data.options.clubs)}
          {data && sel('modstander', 'Alle modstandere', data.options.opponents.map((o) => ({ ...o, label: `mod ${o.label}` })))}
          {data && sel('situation', 'Alle situationer', data.options.situations)}
          {data && sel('spiller', 'Alle spillere', data.options.players)}
          <select style={{ ...input, flex: '1 1 140px' }} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} aria-label="Status">
            <option value="">Alle behandlede</option>
            <option value="godkendt">Kun godkendte</option>
            <option value="laant">Lånte billeder</option>
          </select>
        </div>
        {error && <p style={{ margin: 0, color: '#a3290c', fontSize: 13, fontWeight: 600 }}>{error}</p>}
        {!data && <p style={{ fontSize: 13 }}>Henter …</p>}
        {data && data.photos.length === 0 && <p style={{ fontSize: 13 }}>Ingen billeder passer.</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
          {data?.photos.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={busy !== undefined || !p.ready}
              onClick={() => void choose(p)}
              style={{ textAlign: 'left', border: 0, padding: 0, background: 'var(--surface-2)', borderRadius: 10, overflow: 'hidden', cursor: 'pointer', font: 'inherit', opacity: busy !== undefined && busy !== p.id ? 0.5 : 1 }}
              title={p.alt}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- private admin thumbnail */}
              <img src={`/api/admin/photos/${p.id}/billede?v=thumb`} alt="" loading="lazy" style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', display: 'block' }} />
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '6px 8px', fontSize: 12 }}>
                <b>{p.title}</b>
                <span style={{ color: 'var(--ink-3)' }}>{[p.date, p.players.slice(0, 2).join(', '), p.situation].filter(Boolean).join(' · ')}</span>
                {p.borrowed && <span style={{ color: '#6b4a00' }}>Lånt til {p.licenseUntil} · {p.credit}</span>}
                {p.review && <span style={{ color: '#6b4a00' }}>Ikke gennemgået</span>}
                {busy === p.id && <span>Lægges ind …</span>}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
