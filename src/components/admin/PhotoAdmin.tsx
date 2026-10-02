'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FORMATS, type SomeFormat } from '../../lib/photos/crop'
import { KINDS, type Kind } from '../../lib/photos/kinds'
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
      const out = (await res.json().catch(() => ({}))) as { error?: string; count?: number; token?: string; skipped?: number }
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

/** The bar for many photos at once: approve, rights, move to another match, share, delete */
export function BulkBar({ clubs }: { clubs: { id: string; name: string }[] }) {
  const { busy, error, run } = useAction()
  const [ids, setIds] = useState<number[]>([])
  const [panel, setPanel] = useState<'' | 'rights' | 'match' | 'share' | 'info'>('')
  const [bulkKind, setBulkKind] = useState('')
  const [bulkTags, setBulkTags] = useState('')
  const [credit, setCredit] = useState('')
  const [until, setUntil] = useState('')
  const [club, setClub] = useState('')
  const [opp, setOpp] = useState('')
  const [date, setDate] = useState('')
  const [title, setTitle] = useState('')
  const [days, setDays] = useState('30')
  const [done, setDone] = useState<string>()
  const [link, setLink] = useState<string>()
  useEffect(() => {
    const read = () => setIds([...document.querySelectorAll<HTMLInputElement>('input[name="valg"]:checked')].map((i) => Number(i.value)))
    document.addEventListener('change', read)
    read()
    return () => document.removeEventListener('change', read)
  }, [])
  const all = (on: boolean) => {
    document.querySelectorAll<HTMLInputElement>('input[name="valg"]').forEach((i) => (i.checked = on))
    setIds(on ? [...document.querySelectorAll<HTMLInputElement>('input[name="valg"]')].map((i) => Number(i.value)) : [])
  }
  const act = async (body: Record<string, unknown>, label: string) => {
    setDone(undefined)
    const out = await run({ action: 'bulk', ids, ...body })
    if (out) {
      setDone(`${label}: ${out.count ?? ids.length} billede${out.count === 1 ? '' : 'r'}`)
      setPanel('')
      all(false)
    }
  }
  if (!ids.length)
    return (
      <p className={s.muted} style={{ margin: '8px 0' }}>
        Sæt flueben på billeder for at godkende, flytte, dele eller slette mange ad gangen ·{' '}
        <button className="text-btn" style={{ marginLeft: 0 }} onClick={() => all(true)}>
          Vælg alle viste
        </button>
        {done && <> · {done}</>}
        {link && (
          <>
            {' '}
            · Link: <input readOnly value={link} onFocus={(e) => e.target.select()} style={{ width: 280 }} />
          </>
        )}
      </p>
    )
  return (
    <div className={s.bulk}>
      <b>{ids.length} valgt</b>
      <button className="pill is-active" disabled={busy} onClick={() => void act({ op: 'approve' }, 'Godkendt')}>
        Godkend
      </button>
      <button className="pill" disabled={busy} onClick={() => void act({ op: 'unapprove' }, 'Godkendelse fjernet')}>
        Fortryd godkendelse
      </button>
      <button className="pill" onClick={() => setPanel(panel === 'rights' ? '' : 'rights')}>Rettigheder</button>
      <button className="pill" onClick={() => setPanel(panel === 'info' ? '' : 'info')}>Type og tags</button>
      <button className="pill" onClick={() => setPanel(panel === 'match' ? '' : 'match')}>Flyt til kamp</button>
      <button className="pill" onClick={() => setPanel(panel === 'share' ? '' : 'share')}>Del</button>
      <button
        className="pill"
        disabled={busy}
        onClick={() => {
          if (confirm(`Slet ${ids.length} billede${ids.length === 1 ? '' : 'r'} overalt? Originalerne flyttes til Drives papirkurv (kan fortrydes i 30 dage).`)) void act({ op: 'delete' }, 'Slettet')
        }}
      >
        Slet
      </button>
      <button className="text-btn" onClick={() => all(false)}>
        Fravælg
      </button>
      {panel === 'rights' && (
        <div className={s.bulkPanel}>
          <input value={credit} onChange={(e) => setCredit(e.target.value)} placeholder="Foto: (tom = Matchly.dk)" aria-label="Rettigheder" />
          <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} aria-label="Lånt til og med" title="Lånt til og med (tom = vores eget)" />
          <button className="pill is-active" disabled={busy} onClick={() => void act({ op: 'rights', credit, licenseUntil: until }, 'Rettigheder gemt')}>
            Gem på {ids.length}
          </button>
        </div>
      )}
      {panel === 'info' && (
        <div className={s.bulkPanel}>
          <select value={bulkKind} onChange={(e) => setBulkKind(e.target.value)} aria-label="Billedtype">
            <option value="">Type (uændret)</option>
            {(Object.keys(KINDS) as Kind[]).map((x) => (
              <option key={x} value={x}>
                {KINDS[x]}
              </option>
            ))}
          </select>
          <input value={bulkTags} onChange={(e) => setBulkTags(e.target.value)} placeholder="Tilføj tags, fx Brabrand IF, infografik" aria-label="Tags" />
          <button className="pill is-active" disabled={busy || (!bulkKind && !bulkTags.trim())} onClick={() => void act({ op: 'info', kind: bulkKind, addTags: bulkTags }, 'Type og tags gemt')}>
            Gem på {ids.length}
          </button>
        </div>
      )}
      {panel === 'match' && (
        <div className={s.bulkPanel}>
          <select value={club} onChange={(e) => setClub(e.target.value)} aria-label="Klub">
            <option value="">Klub (uændret)</option>
            {clubs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select value={opp} onChange={(e) => setOpp(e.target.value)} aria-label="Modstander">
            <option value="">Modstander (uændret)</option>
            {clubs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Kampdato" />
          <button className="pill is-active" disabled={busy || (!club && !opp && !date)} onClick={() => void act({ op: 'match', clubId: club, opponentId: opp, date }, 'Flyttet')}>
            Flyt {ids.length}
          </button>
        </div>
      )}
      {panel === 'share' && (
        <div className={s.bulkPanel}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titel, fx Brabrand – Skive 1/8" aria-label="Titel" />
          <select value={days} onChange={(e) => setDays(e.target.value)} aria-label="Gyldig i">
            <option value="7">7 dage</option>
            <option value="30">30 dage</option>
            <option value="90">90 dage</option>
          </select>
          <button
            className="pill is-active"
            disabled={busy}
            onClick={async () => {
              const out = (await run({ action: 'share', ids, days: Number(days), title })) as false | { token?: string; count?: number; skipped?: number }
              if (out && out.token) {
                const url = `${location.origin}/deling/${out.token}`
                setLink(url)
                void navigator.clipboard?.writeText(url).catch(() => undefined)
                setDone(`Link lavet til ${out.count} billeder${out.skipped ? ` (${out.skipped} lånte/ikke-behandlede sprunget over)` : ''} – kopieret`)
                setPanel('')
                all(false)
              }
            }}
          >
            Lav link
          </button>
        </div>
      )}
      {error && <span className={s.error} style={{ color: '#ffb4a3' }}>{error}</span>}
    </div>
  )
}

/** Copies a text (the post draft) to the clipboard */
export function CopyButton({ text, label = 'Kopiér tekst' }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false)
  return (
    <button
      className="pill"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setOk(true)
          setTimeout(() => setOk(false), 2000)
        })
      }}
    >
      {ok ? 'Kopieret' : label}
    </button>
  )
}

export function RevokeShare({ id }: { id: number }) {
  const { busy, error, run } = useAction()
  return (
    <>
      <button className="text-btn" disabled={busy} onClick={() => void run({ action: 'revoke-share', id })}>
        Luk linket
      </button>
      {error && <span className={s.error}> {error}</span>}
    </>
  )
}

/** Tags as removable chips, with a menu of clubs and leagues and free text */
export function TagPicker({ tags, onChange, suggestions }: { tags: string[]; onChange: (t: string[]) => void; suggestions: string[] }) {
  const [text, setText] = useState('')
  const add = (raw: string) => {
    const add = raw.split(',').map((t) => t.trim()).filter(Boolean)
    if (add.length) onChange([...tags, ...add.filter((a) => !tags.some((t) => t.toLowerCase() === a.toLowerCase()))])
    setText('')
  }
  return (
    <div className={s.form} style={{ alignItems: 'flex-start' }}>
      <select value="" onChange={(e) => e.target.value && add(e.target.value)} aria-label="Tilføj klub eller liga">
        <option value="">Klub eller liga …</option>
        {suggestions.map((n) => (
          <option key={n} value={n} disabled={tags.includes(n)}>
            {n}
          </option>
        ))}
      </select>
      <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add(text))} placeholder="Eget tag, fx transfer, infografik" aria-label="Eget tag" />
      <button type="button" className="pill" onClick={() => add(text)} disabled={!text.trim()}>
        Tilføj
      </button>
      {tags.length > 0 && (
        <span className={s.chips} style={{ flexBasis: '100%' }}>
          {tags.map((t) => (
            <button key={t} type="button" className={`${s.chip} ${s.opp}`} onClick={() => onChange(tags.filter((x) => x !== t))} title="Fjern" style={{ border: 0, cursor: 'pointer' }}>
              {t} ×
            </button>
          ))}
        </span>
      )}
    </div>
  )
}

/** What the picture is, its title and our own tags */
export function InfoEditor({ photoId, kind, kindManual, title, tags, suggestions }: { photoId: number; kind: Kind; kindManual: boolean; title: string | null; tags: string[]; suggestions: string[] }) {
  const { busy, error, run } = useAction()
  const [k, setK] = useState<Kind>(kind)
  const [t, setT] = useState(title ?? '')
  const [tg, setTg] = useState(tags)
  const changed = k !== kind || t !== (title ?? '') || JSON.stringify(tg) !== JSON.stringify(tags)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className={s.form}>
        <select value={k} onChange={(e) => setK(e.target.value as Kind)} aria-label="Billedtype">
          {(Object.keys(KINDS) as Kind[]).map((x) => (
            <option key={x} value={x}>
              {KINDS[x]}
            </option>
          ))}
        </select>
        <input value={t} onChange={(e) => setT(e.target.value)} placeholder="Titel" aria-label="Titel" style={{ flex: '2 1 200px' }} />
      </div>
      <span className={s.muted}>{kindManual ? 'Typen er valgt i hånden.' : 'Typen er foreslået af AI – ret den, hvis den er forkert.'} Grafik får ingen spiller-tags.</span>
      <TagPicker tags={tg} onChange={setTg} suggestions={suggestions} />
      {changed && (
        <button type="button" className="pill is-active" disabled={busy} onClick={() => void run({ action: 'set-info', photo: photoId, kind: k, title: t, tags: tg })} style={{ alignSelf: 'flex-start' }}>
          Gem type, titel og tags
        </button>
      )}
      {error && <span className={s.error}>{error}</span>}
    </div>
  )
}
