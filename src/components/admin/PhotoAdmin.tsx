'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FORMATS, type SomeFormat } from '../../lib/photos/crop'
import s from './photos.module.css'

// The photo admin's editors (/admin/billeder): tags, match, approval, review
// suggestions, squads and club kits. Every change goes to /api/admin/photos.

type Side = 'egen' | 'modstander' | 'ukendt'

function useAction() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const run = async (body: Record<string, unknown>) => {
    setBusy(true)
    setError(undefined)
    try {
      const res = await fetch('/api/admin/photos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const out = (await res.json().catch(() => ({}))) as { error?: string; count?: number }
      if (!res.ok) {
        setError(out.error ?? 'Noget gik galt')
        return false
      }
      router.refresh()
      return out
    } catch {
      setError('Kunne ikke nå serveren')
      return false
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, run }
}

const SIDES: { value: Side; label: string }[] = [
  { value: 'egen', label: 'Egen klub' },
  { value: 'modstander', label: 'Modstander' },
  { value: 'ukendt', label: 'Ukendt' },
]

export function TagRow({
  tag,
  photoId,
}: {
  tag: { id: number; number: number | null; playerName: string | null; side: Side; note: string | null; info: string }
  photoId: number
}) {
  const { busy, error, run } = useAction()
  const [number, setNumber] = useState(tag.number == null ? '' : String(tag.number))
  const [name, setName] = useState(tag.playerName ?? '')
  const [side, setSide] = useState<Side>(tag.side)
  const changed = number !== (tag.number == null ? '' : String(tag.number)) || name !== (tag.playerName ?? '') || side !== tag.side
  return (
    <div className={s.row}>
      <input inputMode="numeric" value={number} onChange={(e) => setNumber(e.target.value.replace(/\D/g, '').slice(0, 2))} aria-label="Nummer" />
      <div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={side === 'egen' ? 'Tom = slå op' : 'Navn'} aria-label="Navn" />
        <div className={s.muted}>{tag.info}</div>
        {tag.note && <div className={s.note}>{tag.note}</div>}
      </div>
      <select value={side} onChange={(e) => setSide(e.target.value as Side)} aria-label="Hold">
        {SIDES.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <div className={s.rowActions}>
        {changed && (
          <button className="pill is-active" disabled={busy} onClick={() => void run({ action: 'update-tag', tag: tag.id, number, name, side })}>
            Gem
          </button>
        )}
        <button className="text-btn" style={{ marginLeft: 0 }} disabled={busy} onClick={() => void run({ action: 'delete-tag', tag: tag.id })}>
          Slet
        </button>
        <span className={s.some}>
          SoMe:
          {(Object.keys(FORMATS) as SomeFormat[]).map((f) => (
            <a key={f} className="text-btn" style={{ marginLeft: 0 }} href={`/api/admin/photos/${photoId}/some?format=${f}&tag=${tag.id}`}>
              {FORMATS[f].label}
            </a>
          ))}
        </span>
        {error && <span className={s.error}>{error}</span>}
      </div>
    </div>
  )
}

export function AddTag({ photoId }: { photoId: number }) {
  const { busy, error, run } = useAction()
  const [number, setNumber] = useState('')
  const [name, setName] = useState('')
  const [side, setSide] = useState<Side>('egen')
  return (
    <form
      className={s.form}
      onSubmit={async (e) => {
        e.preventDefault()
        if (await run({ action: 'add-tag', photo: photoId, number, name, side })) {
          setNumber('')
          setName('')
        }
      }}
    >
      <input inputMode="numeric" value={number} onChange={(e) => setNumber(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="Nr." aria-label="Nummer" style={{ flex: '0 0 64px' }} />
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Navn (tom = slå op)" aria-label="Navn" />
      <select value={side} onChange={(e) => setSide(e.target.value as Side)} aria-label="Hold" style={{ flex: '0 0 120px' }}>
        {SIDES.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <button className="pill" disabled={busy || (!number && !name)}>
        Tilføj
      </button>
      {error && <span className={s.error}>{error}</span>}
    </form>
  )
}

export function ApproveButton({ photoId, approved }: { photoId: number; approved: boolean }) {
  const { busy, error, run } = useAction()
  return (
    <span>
      <button className={approved ? 'pill' : 'pill is-active'} disabled={busy} onClick={() => void run({ action: 'approve', photo: photoId, approved: !approved })}>
        {approved ? 'Fortryd godkendelse' : 'Godkend billedet'}
      </button>
      {error && <span className={s.error}> {error}</span>}
    </span>
  )
}

export function MatchEditor({
  photoId,
  clubId,
  opponentId,
  date,
  clubs,
}: {
  photoId: number
  clubId: string | null
  opponentId: string | null
  date: string | null
  clubs: { id: string; name: string }[]
}) {
  const { busy, error, run } = useAction()
  const [club, setClub] = useState(clubId ?? '')
  const [opp, setOpp] = useState(opponentId ?? '')
  const [day, setDay] = useState(date ?? '')
  const changed = club !== (clubId ?? '') || opp !== (opponentId ?? '') || day !== (date ?? '')
  return (
    <div className={s.form}>
      <select value={club} onChange={(e) => setClub(e.target.value)} aria-label="Klub">
        <option value="">Klub?</option>
        {clubs.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <select value={opp} onChange={(e) => setOpp(e.target.value)} aria-label="Modstander">
        <option value="">Modstander?</option>
        {clubs.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <input type="date" value={day} onChange={(e) => setDay(e.target.value)} aria-label="Kampdato" />
      {changed && (
        <button className="pill is-active" disabled={busy} onClick={() => void run({ action: 'set-match', photo: photoId, clubId: club, opponentId: opp, date: day })}>
          Gem kamp
        </button>
      )}
      {error && <span className={s.error}>{error}</span>}
    </div>
  )
}

export function SuggestionButton({ tagId, name, number, otherNumber }: { tagId: number; name: string; number: number; otherNumber: boolean }) {
  const { busy, error, run } = useAction()
  return (
    <span>
      <button className="pill is-active" disabled={busy} onClick={() => void run({ action: 'update-tag', tag: tagId, name, side: 'egen', ...(otherNumber ? {} : { number }) })}>
        {name}
        {otherNumber ? ` (bærer #${number})` : ''}
      </button>
      {error && <span className={s.error}> {error}</span>}
    </span>
  )
}

export function SquadAdd({ clubId }: { clubId: string }) {
  const { busy, error, run } = useAction()
  const [number, setNumber] = useState('')
  const [name, setName] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  return (
    <form
      className={`panel ${s.form}`}
      style={{ padding: 12 }}
      onSubmit={async (e) => {
        e.preventDefault()
        if (await run({ action: 'add-squad', club: clubId, number, name, validFrom: from, validTo: to })) {
          setNumber('')
          setName('')
        }
      }}
    >
      <input inputMode="numeric" value={number} onChange={(e) => setNumber(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="Nr." aria-label="Nummer" style={{ flex: '0 0 64px' }} />
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Fulde navn" aria-label="Navn" />
      <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Gyldig fra" title="Gyldig fra (tom = altid)" />
      <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Gyldig til" title="Gyldig til (tom = stadig)" />
      <button className="pill is-active" disabled={busy || !number || !name}>
        Tilføj rettelse
      </button>
      {error && <span className={s.error}>{error}</span>}
    </form>
  )
}

export function SquadDelete({ id }: { id: number }) {
  const { busy, error, run } = useAction()
  return (
    <>
      <button className="text-btn" disabled={busy} onClick={() => void run({ action: 'delete-squad', id })}>
        Slet
      </button>
      {error && <span className={s.error}> {error}</span>}
    </>
  )
}

export function ClubEditor({ clubId, extraColors, aliases }: { clubId: string; extraColors: string[]; aliases: string[] }) {
  const { busy, error, run } = useAction()
  const [colors, setColors] = useState(extraColors.join(', '))
  const [names, setNames] = useState(aliases.join(', '))
  return (
    <form
      className={s.form}
      onSubmit={(e) => {
        e.preventDefault()
        void run({ action: 'update-club', club: clubId, extraColors: colors.split(','), aliases: names.split(',') })
      }}
    >
      <input value={colors} onChange={(e) => setColors(e.target.value)} placeholder="Udebanetrøjer, fx hvid, sort" aria-label="Ekstra trøjefarver" />
      <input value={names} onChange={(e) => setNames(e.target.value)} placeholder="Andre navne, fx Brabrand IF" aria-label="Andre navne" />
      <button className="pill" disabled={busy}>
        Gem
      </button>
      {error && <span className={s.error}>{error}</span>}
    </form>
  )
}

export function RightsEditor({ photoId, credit, licenseUntil, defaultCredit, today }: { photoId: number; credit: string | null; licenseUntil: string | null; defaultCredit: string; today: string }) {
  const { busy, error, run } = useAction()
  const [who, setWho] = useState(credit ?? '')
  const [until, setUntil] = useState(licenseUntil ?? '')
  const [whole, setWhole] = useState(false)
  const [saved, setSaved] = useState<string>()
  const changed = who !== (credit ?? '') || until !== (licenseUntil ?? '') || whole
  return (
    <form
      className={s.form}
      onSubmit={async (e) => {
        e.preventDefault()
        setSaved(undefined)
        const out = await run({ action: 'set-rights', photo: photoId, credit: who, licenseUntil: until, wholeMatch: whole })
        if (out) {
          setSaved(`Gemt på ${out.count ?? 1} billede${out.count === 1 ? '' : 'r'}`)
          setWhole(false)
        }
      }}
    >
      <label className={s.muted} style={{ flexBasis: '100%' }}>
        Foto (rettigheder)
        <input value={who} onChange={(e) => setWho(e.target.value)} placeholder={defaultCredit} aria-label="Rettigheder" />
      </label>
      <label className={s.muted} style={{ flexBasis: '100%' }}>
        Lånt til og med (tom = vores eget billede)
        <input type="date" value={until} min={today} onChange={(e) => setUntil(e.target.value)} aria-label="Lånt til" />
      </label>
      <label className={s.muted} style={{ display: 'flex', gap: 6, alignItems: 'center', flexBasis: '100%' }}>
        <input type="checkbox" checked={whole} onChange={(e) => setWhole(e.target.checked)} style={{ width: 'auto' }} />
        Gælder alle billeder fra denne kamp
      </label>
      {until && until < today && <span className={s.error}>Datoen er overskredet – billedet slettes ved næste kørsel.</span>}
      <button className={changed ? 'pill is-active' : 'pill'} disabled={busy || !changed}>
        Gem rettigheder
      </button>
      {saved && <span className={s.muted}>{saved}</span>}
      {error && <span className={s.error}>{error}</span>}
    </form>
  )
}

/** Runs the photo job now; while it runs the page refreshes itself every 10 seconds */
export function SyncButton({ running, requested }: { running?: string; requested: boolean }) {
  const router = useRouter()
  const { busy, error, run } = useAction()
  const active = !!running || requested
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => router.refresh(), 10_000)
    return () => clearInterval(t)
  }, [active, router])
  const since = running ? new Date(running).toLocaleTimeString('da-DK', { timeZone: 'Europe/Copenhagen', hour: '2-digit', minute: '2-digit' }) : undefined
  return (
    <span className={s.some}>
      <button className="pill is-active" disabled={busy || active} onClick={() => void run({ action: 'sync' })}>
        {running ? 'Sync kører…' : requested ? 'Sync starter…' : 'Sync'}
      </button>
      <span className={s.muted}>{running ? `Startet ${since} – henter nye billeder fra Drive og tagger dem` : requested ? 'Starter om et øjeblik' : 'Kører også selv hvert 10. minut kl. 00–06'}</span>
      {error && <span className={s.error}>{error}</span>}
    </span>
  )
}

/** A GET filter form that sends itself when a select or date changes (text fields on Enter) */
export function AutoFilterForm({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <form
      className={className}
      style={style}
      method="get"
      onChange={(e) => {
        const t = e.target as HTMLElement
        if (t.tagName === 'SELECT' || (t as HTMLInputElement).type === 'date') (e.currentTarget as HTMLFormElement).requestSubmit()
      }}
    >
      {children}
    </form>
  )
}
