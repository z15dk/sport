'use client'

import { useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'

// The social media admin (/admin/sociale): buttons, the text editor, the
// match picker and the settings. Everything goes to /api/admin/social.

type Result = { ok?: boolean; message?: string; error?: string; data?: unknown }

async function send(body: Record<string, unknown>): Promise<Result> {
  const res = await fetch('/api/admin/social', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => undefined)
  if (!res) return { error: 'Ingen forbindelse' }
  return ((await res.json().catch(() => ({}))) as Result) ?? {}
}

function useAction() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; error?: boolean }>()
  const run = async (body: Record<string, unknown>) => {
    setBusy(true)
    setMsg(undefined)
    const r = await send(body)
    setBusy(false)
    setMsg(r.error ? { text: r.error, error: true } : r.message ? { text: r.message } : undefined)
    if (!r.error) router.refresh()
    return r
  }
  return { busy, msg, run }
}

const Msg = ({ msg }: { msg?: { text: string; error?: boolean } }) =>
  msg ? <span className={`social-msg${msg.error ? ' is-error' : ' is-ok'}`}>{msg.text}</span> : null

/** A button that runs one action, with its answer beside it */
export function ActionButton({ body, label, busyLabel, confirm: ask, pill }: { body: Record<string, unknown>; label: string; busyLabel?: string; confirm?: string; pill?: boolean }) {
  const { busy, msg, run } = useAction()
  return (
    <span className="social-action">
      <button type="button" className={pill ? 'pill' : 'text-btn'} disabled={busy} onClick={() => (!ask || confirm(ask)) && run(body)}>
        {busy ? (busyLabel ?? 'Et øjeblik …') : label}
      </button>
      <Msg msg={msg} />
    </span>
  )
}

/** The settings a switch changes: the engine, dry run or one platform ("platform:facebook") */
function switchConfig(setting: string, on: boolean): Record<string, unknown> {
  if (setting.startsWith('platform:')) return { platforms: { [setting.slice(9)]: on } }
  return { [setting]: on }
}

/** A switch for one yes/no setting */
export function ConfigSwitch({ setting, value, label }: { setting: 'enabled' | 'dryRun' | `platform:${string}`; value: boolean; label: string }) {
  const { busy, msg, run } = useAction()
  return (
    <span className="social-switch">
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={label}
        className={`switch-toggle${value ? ' is-on' : ''}`}
        disabled={busy}
        onClick={() => run({ action: 'config', config: switchConfig(setting, !value) })}
      >
        <span className="switch-toggle__knob" />
      </button>
      <span>{label}</span>
      <Msg msg={msg} />
    </span>
  )
}

/** The post's text, editable until it is out */
export function CaptionEditor({ id, caption, edited, locked }: { id: string; caption: string; edited?: boolean; locked?: boolean }) {
  const [text, setText] = useState(caption)
  const { busy, msg, run } = useAction()
  return (
    <div className="social-caption">
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={Math.min(12, Math.max(3, text.split('\n').length + 1))} disabled={locked} />
      {!locked && (
        <div>
          <button type="button" className="text-btn" disabled={busy || text === caption} onClick={() => run({ action: 'caption', id, caption: text })}>
            Gem teksten
          </button>
          {edited && <span className="muted small"> · rettet i hånden</span>}
          <Msg msg={msg} />
        </div>
      )}
    </div>
  )
}

export interface Candidate {
  id: string
  label: string
  league: string
  time: string
  score: number
}

/** The day's matches: the engine's choice, or picked by hand */
export function MatchPicker({ date, candidates, chosen, manual }: { date: string; candidates: Candidate[]; chosen: string[]; manual: boolean }) {
  const [picked, setPicked] = useState<string[]>(chosen)
  const [open, setOpen] = useState(false)
  const { busy, msg, run } = useAction()
  if (!open)
    return (
      <p>
        <button type="button" className="pill" onClick={() => setOpen(true)}>
          Vælg kampene selv
        </button>{' '}
        {manual && <span className="muted small">Valgt i hånden</span>}
      </p>
    )
  return (
    <div className="social-picker">
      <p className="muted small">Kampene er sorteret efter prioritet (ligaens vægt, tabel, favoritklubber). Vælg dem, der skal med – dagen planlægges så igen.</p>
      <ul>
        {candidates.map((c) => (
          <li key={c.id}>
            <label>
              <input type="checkbox" checked={picked.includes(c.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, c.id] : picked.filter((x) => x !== c.id))} />
              <b>{c.time}</b> {c.label} <span className="muted small">· {c.league} · prioritet {c.score}</span>
            </label>
          </li>
        ))}
      </ul>
      <p>
        <button type="button" className="pill is-active" disabled={busy || !picked.length} onClick={() => run({ action: 'manual', date, ids: picked })}>
          Brug {picked.length} kampe
        </button>{' '}
        {manual && (
          <button type="button" className="pill" disabled={busy} onClick={() => run({ action: 'manual', date, ids: [] })}>
            Automatisk valg igen
          </button>
        )}{' '}
        <button type="button" className="text-btn" onClick={() => setOpen(false)}>
          Luk
        </button>{' '}
        <Msg msg={msg} />
      </p>
    </div>
  )
}

// ---------------------------------------------------------------- settings

const Field = ({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) => (
  <label className="social-field">
    <span>{label}</span>
    {children}
    {hint && <small className="muted">{hint}</small>}
  </label>
)

/** A form that sends its fields as one action */
function ActionForm({ build, children, submit }: { build: (f: FormData) => Record<string, unknown>; children: ReactNode; submit: string }) {
  const { busy, msg, run } = useAction()
  return (
    <form
      className="social-form"
      onSubmit={async (e) => {
        e.preventDefault()
        const r = await run(build(new FormData(e.currentTarget)))
        if (!r.error) e.currentTarget?.querySelectorAll<HTMLInputElement>('input[data-secret]').forEach((i) => (i.value = ''))
      }}
    >
      {children}
      <p>
        <button type="submit" className="pill is-active" disabled={busy}>
          {busy ? 'Et øjeblik …' : submit}
        </button>{' '}
        <Msg msg={msg} />
      </p>
    </form>
  )
}

const val = (f: FormData, k: string) => String(f.get(k) ?? '').trim()

export function EmailForm({ email, hasPass }: { email: { to: string; from: string; host: string; port: number; user: string; secure: boolean }; hasPass: boolean }) {
  return (
    <>
      <ActionForm
        submit="Gem mail"
        build={(f) => ({
          action: 'config',
          config: { email: { to: val(f, 'to'), from: val(f, 'from'), host: val(f, 'host'), port: Number(val(f, 'port')) || 587, user: val(f, 'user'), secure: f.get('secure') === 'on' } },
        })}
      >
        <div className="social-grid">
          <Field label="Send godkendelser til">
            <input name="to" type="email" defaultValue={email.to} placeholder="din@mail.dk" />
          </Field>
          <Field label="Afsender" hint="Fx Matchly <noreply@matchly.dk>. Tom = brugernavnet.">
            <input name="from" defaultValue={email.from} />
          </Field>
          <Field label="SMTP-server" hint="Fx smtp.simply.com, smtp.gmail.com eller smtp.office365.com">
            <input name="host" defaultValue={email.host} />
          </Field>
          <Field label="Port" hint="587 (STARTTLS) eller 465 (SSL)">
            <input name="port" type="number" defaultValue={email.port} />
          </Field>
          <Field label="Brugernavn">
            <input name="user" defaultValue={email.user} autoComplete="off" />
          </Field>
          <label className="social-check">
            <input name="secure" type="checkbox" defaultChecked={email.secure} /> SSL fra start (port 465)
          </label>
        </div>
      </ActionForm>
      <ActionForm submit="Gem adgangskode" build={(f) => ({ action: 'smtp', pass: val(f, 'pass') })}>
        <Field label="SMTP-adgangskode" hint={hasPass ? 'Gemt. Skriv en ny for at skifte den.' : 'Ikke gemt endnu. Gmail: brug en app-adgangskode.'}>
          <input name="pass" type="password" data-secret autoComplete="new-password" />
        </Field>
      </ActionForm>
      <ActionButton body={{ action: 'testMail' }} label="Send en testmail" pill />
    </>
  )
}

export function MetaConnect() {
  const [pages, setPages] = useState<{ id: string; name: string }[]>()
  const [keep, setKeep] = useState<Record<string, unknown>>({})
  const { busy, msg, run } = useAction()
  return (
    <form
      className="social-form"
      onSubmit={async (e) => {
        e.preventDefault()
        const f = new FormData(e.currentTarget)
        const body = pages ? { ...keep, pageId: val(f, 'pageId') } : { action: 'meta', appId: val(f, 'appId'), appSecret: val(f, 'appSecret'), userToken: val(f, 'userToken') }
        const r = await run(body)
        const d = r.data as { choose?: { id: string; name: string }[] } | undefined
        if (d?.choose) {
          setPages(d.choose)
          setKeep(body)
        } else if (!r.error) setPages(undefined)
      }}
    >
      {pages ? (
        <Field label="Vælg Facebook-siden">
          <select name="pageId">
            {pages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <div className="social-grid">
          <Field label="App-id">
            <input name="appId" autoComplete="off" required />
          </Field>
          <Field label="App-hemmelighed (App secret)">
            <input name="appSecret" type="password" data-secret autoComplete="new-password" required />
          </Field>
          <Field label="Bruger-token fra Graph API Explorer" hint="Laves om til en side-token, der ikke udløber.">
            <input name="userToken" type="password" data-secret autoComplete="new-password" required />
          </Field>
        </div>
      )}
      <p>
        <button type="submit" className="pill is-active" disabled={busy}>
          {busy ? 'Forbinder …' : pages ? 'Brug siden' : 'Forbind Facebook og Instagram'}
        </button>{' '}
        <Msg msg={msg} />
      </p>
    </form>
  )
}

/** Facebook and Instagram by hand: the Page's id and token and the Instagram account's id */
export function MetaManual() {
  return (
    <ActionForm submit="Gem" build={(f) => ({ action: 'metaManual', pageId: val(f, 'pageId'), pageToken: val(f, 'pageToken'), igUserId: val(f, 'igUserId') })}>
      <div className="social-grid">
        <Field label="Side-id">
          <input name="pageId" autoComplete="off" />
        </Field>
        <Field label="Side-token">
          <input name="pageToken" type="password" data-secret autoComplete="new-password" />
        </Field>
        <Field label="Instagram-konto-id" hint="Instagram Business-kontoens id (ikke brugernavnet)">
          <input name="igUserId" autoComplete="off" />
        </Field>
      </div>
    </ActionForm>
  )
}

export function ThreadsConnect() {
  return (
    <ActionForm submit="Forbind Threads" build={(f) => ({ action: 'threads', token: val(f, 'token') })}>
      <Field label="Threads-token (lang levetid)" hint="Fornyes automatisk hver uge.">
        <input name="token" type="password" data-secret autoComplete="new-password" required />
      </Field>
    </ActionForm>
  )
}

export function XConnect() {
  return (
    <ActionForm
      submit="Forbind X"
      build={(f) => ({ action: 'x', apiKey: val(f, 'apiKey'), apiSecret: val(f, 'apiSecret'), accessToken: val(f, 'accessToken'), accessSecret: val(f, 'accessSecret') })}
    >
      <div className="social-grid">
        <Field label="API Key (Consumer Key)">
          <input name="apiKey" autoComplete="off" required />
        </Field>
        <Field label="API Key Secret">
          <input name="apiSecret" type="password" data-secret autoComplete="new-password" required />
        </Field>
        <Field label="Access Token">
          <input name="accessToken" autoComplete="off" required />
        </Field>
        <Field label="Access Token Secret">
          <input name="accessSecret" type="password" data-secret autoComplete="new-password" required />
        </Field>
      </div>
    </ActionForm>
  )
}

export interface SettingsProps {
  times: { draft: string; programme: string; topic: string; storyBefore: number; resultsAfter: number }
  matches: number
  kinds: Record<string, { enabled: boolean; platforms: string[] }>
  kindNames: Record<string, string>
  platformNames: Record<string, string>
  storyPlatforms: string[]
  topics: Record<string, string>
  topicList: { id: string; name: string; description: string }[]
  topicLeague: string
  leagues: { key: string; name: string; weight: number; saved?: number }[]
  favorites: string[]
  hashtags: string
  approval: { always: boolean; until?: string }
}

const WEEKDAYS = [
  ['1', 'Mandag'],
  ['2', 'Tirsdag'],
  ['3', 'Onsdag'],
  ['4', 'Torsdag'],
  ['5', 'Fredag'],
  ['6', 'Lørdag'],
  ['0', 'Søndag'],
]

export function ScheduleForm(p: SettingsProps) {
  return (
    <ActionForm
      submit="Gem tider og opslag"
      build={(f) => ({
        action: 'config',
        config: {
          times: { draft: val(f, 'draft'), programme: val(f, 'programme'), topic: val(f, 'topic'), storyBefore: Number(val(f, 'storyBefore')), resultsAfter: Number(val(f, 'resultsAfter')) },
          matches: Number(val(f, 'matches')),
          kinds: Object.fromEntries(Object.keys(p.kinds).map((k) => [k, { enabled: f.get(`kind-${k}`) === 'on', platforms: f.getAll(`kind-${k}-p`).map(String) }])),
          hashtags: val(f, 'hashtags'),
        },
      })}
    >
      <div className="social-grid">
        <Field label="Dagens plan laves kl." hint="Så kommer godkendelsesmailen">
          <input name="draft" type="time" defaultValue={p.times.draft} />
        </Field>
        <Field label="Dagens kampe postes kl." hint="Mellem 07 og 08">
          <input name="programme" type="time" defaultValue={p.times.programme} />
        </Field>
        <Field label="Dagens emne postes kl." hint="Mellem 10 og 11">
          <input name="topic" type="time" defaultValue={p.times.topic} />
        </Field>
        <Field label="Story, minutter før kampstart">
          <input name="storyBefore" type="number" min={5} max={240} defaultValue={p.times.storyBefore} />
        </Field>
        <Field label="Resultater, minutter efter sidste kamp">
          <input name="resultsAfter" type="number" min={0} max={240} defaultValue={p.times.resultsAfter} />
        </Field>
        <Field label="Antal udvalgte kampe pr. dag">
          <input name="matches" type="number" min={1} max={10} defaultValue={p.matches} />
        </Field>
      </div>
      <div className="social-kinds">
        {Object.entries(p.kinds).map(([k, v]) => (
          <div key={k} className="social-kind">
            <label className="social-check">
              <input type="checkbox" name={`kind-${k}`} defaultChecked={v.enabled} /> {p.kindNames[k]}
            </label>
            <div className="social-chips">
              {Object.entries(p.platformNames)
                .filter(([pl]) => k !== 'story' || p.storyPlatforms.includes(pl))
                .map(([pl, name]) => (
                  <label key={pl} className="social-chip">
                    <input type="checkbox" name={`kind-${k}-p`} value={pl} defaultChecked={v.platforms.includes(pl)} /> {name}
                  </label>
                ))}
            </div>
          </div>
        ))}
      </div>
      <p className="muted small">Dagens kampe går både i feed og som story på Facebook og Instagram. Threads og X har ingen stories i deres API.</p>
      <Field label="Hashtags" hint="Sættes under teksten på Facebook og Instagram">
        <input name="hashtags" defaultValue={p.hashtags} />
      </Field>
    </ActionForm>
  )
}

export function TopicsForm(p: SettingsProps & { divisions: { id: string; name: string }[] }) {
  return (
    <ActionForm
      submit="Gem emnerne"
      build={(f) => ({ action: 'config', config: { topics: Object.fromEntries(WEEKDAYS.map(([d]) => [d, val(f, `topic-${d}`)])), topicLeague: val(f, 'topicLeague') } })}
    >
      <div className="social-grid">
        {WEEKDAYS.map(([d, name]) => (
          <Field key={d} label={name}>
            <select name={`topic-${d}`} defaultValue={p.topics[d] ?? 'none'}>
              <option value="none">Intet emne</option>
              {p.topicList.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
        ))}
        <Field label="Liga til topscorere, form og tabel">
          <select name="topicLeague" defaultValue={p.topicLeague}>
            {p.divisions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <ul className="muted small">
        {p.topicList.map((t) => (
          <li key={t.id}>
            <b>{t.name}:</b> {t.description}
          </li>
        ))}
      </ul>
    </ActionForm>
  )
}

export function PriorityForm(p: SettingsProps & { clubs: string[] }) {
  const [favorites, setFavorites] = useState<string[]>(p.favorites)
  const [add, setAdd] = useState('')
  return (
    <ActionForm
      submit="Gem prioriteringen"
      build={(f) => ({
        action: 'config',
        config: { weights: Object.fromEntries(p.leagues.map((l) => [l.key, val(f, `w-${l.key}`)]).filter(([, v]) => v !== '')), favorites },
      })}
    >
      <p className="muted small">
        Hver kamp får ligaens vægt plus point for tabel (top mod top, tæt placering, bundstrid) og mål. Den bedste kamp fra hver liga kommer først. 0 = ligaen er
        aldrig med. Tomt felt = standardvægten.
      </p>
      <div className="social-weights">
        {p.leagues.map((l) => (
          <Field key={l.key} label={l.name}>
            <input name={`w-${l.key}`} type="number" min={0} max={500} placeholder={String(l.weight)} defaultValue={l.saved ?? ''} />
          </Field>
        ))}
      </div>
      <Field label="Favoritklubber" hint="Kommer altid med, når de spiller (+200 i prioritet)">
        <span className="social-tags">
          {favorites.map((f) => (
            <button key={f} type="button" className="pill" onClick={() => setFavorites(favorites.filter((x) => x !== f))} title="Fjern">
              {f} ×
            </button>
          ))}
        </span>
      </Field>
      <span className="social-add">
        <input list="social-clubs" value={add} onChange={(e) => setAdd(e.target.value)} placeholder="Tilføj klub" />
        <datalist id="social-clubs">
          {p.clubs.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <button
          type="button"
          className="pill"
          disabled={!add.trim()}
          onClick={() => {
            if (!favorites.includes(add.trim())) setFavorites([...favorites, add.trim()])
            setAdd('')
          }}
        >
          Tilføj
        </button>
      </span>
    </ActionForm>
  )
}

export function ApprovalForm({ approval }: { approval: { always: boolean; until?: string } }) {
  return (
    <ActionForm submit="Gem godkendelse" build={(f) => ({ action: 'config', config: { approval: { always: f.get('always') === 'on', until: val(f, 'until') || undefined } } })}>
      <div className="social-grid">
        <Field label="Godkend alle opslag til og med" hint="Sættes automatisk til 2 uger, første gang motoren slås til. Tomt = ingen godkendelse.">
          <input name="until" type="date" defaultValue={approval.until ?? ''} />
        </Field>
        <label className="social-check">
          <input name="always" type="checkbox" defaultChecked={approval.always} /> Godkend altid
        </label>
      </div>
    </ActionForm>
  )
}

// ---------------------------------------------------------------- tags

export interface TagRow {
  name: string
  group: string
  handles: Record<string, string>
}

/** One club's (or league's) @names, one field per platform */
function TagEditor({ row, platforms }: { row: TagRow; platforms: Record<string, string> }) {
  const [values, setValues] = useState(row.handles)
  const { busy, msg, run } = useAction()
  const changed = Object.keys(platforms).some((p) => (values[p] ?? '') !== (row.handles[p] ?? ''))
  return (
    <li className="social-tagrow">
      <strong>{row.name}</strong>
      {Object.entries(platforms).map(([p, label]) => (
        <input
          key={p}
          aria-label={`${row.name} på ${label}`}
          placeholder={`@ ${label}`}
          value={values[p] ?? ''}
          onChange={(e) => setValues({ ...values, [p]: e.target.value })}
        />
      ))}
      <span className="social-action">
        <button type="button" className="text-btn" disabled={busy || !changed} onClick={() => run({ action: 'handles', name: row.name, handles: values })}>
          Gem
        </button>
        <Msg msg={msg} />
      </span>
    </li>
  )
}

/** Every club and league with its tags; filter by name, or only the ones with/without tags */
export function TagsAdmin({ rows, platforms }: { rows: TagRow[]; platforms: Record<string, string> }) {
  const [q, setQ] = useState('')
  const [only, setOnly] = useState<'all' | 'with' | 'without'>('all')
  const [extra, setExtra] = useState('')
  const [added, setAdded] = useState<TagRow[]>([])
  const all = [...added, ...rows]
  const shown = all.filter((r) => {
    const has = Object.values(r.handles).some(Boolean)
    return r.name.toLowerCase().includes(q.trim().toLowerCase()) && (only === 'all' || (only === 'with') === has)
  })
  const groups = [...new Set(shown.map((r) => r.group))]
  return (
    <>
      <div className="admin-filter">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Søg klub eller liga" />
        {(['all', 'with', 'without'] as const).map((o) => (
          <button key={o} type="button" className={`pill${only === o ? ' is-active' : ''}`} onClick={() => setOnly(o)}>
            {o === 'all' ? 'Alle' : o === 'with' ? 'Med tags' : 'Uden tags'}
          </button>
        ))}
      </div>
      {groups.map((g) => (
        <section key={g} className="panel prose__section">
          <h2 className="panel__title">{g}</h2>
          <ul className="social-tags-list">
            {shown
              .filter((r) => r.group === g)
              .map((r) => (
                <TagEditor key={r.name} row={r} platforms={platforms} />
              ))}
          </ul>
        </section>
      ))}
      <section className="panel prose__section">
        <h2 className="panel__title">Tilføj et andet navn</h2>
        <div className="social-pad">
          <p className="muted small">Fx en klub fra en udenlandsk liga eller en turnering, præcis som navnet står i opslagene (&quot;Real Madrid&quot;, &quot;Champions League&quot;).</p>
          <span className="social-add">
            <input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Navn" />
            <button
              type="button"
              className="pill"
              disabled={!extra.trim() || all.some((r) => r.name === extra.trim())}
              onClick={() => {
                setAdded([{ name: extra.trim(), group: 'Andre navne', handles: {} }, ...added])
                setExtra('')
                setQ('')
                setOnly('all')
              }}
            >
              Tilføj
            </button>
          </span>
        </div>
      </section>
    </>
  )
}

/** A picture made smaller in the browser before it is sent (at most 2048 px, JPEG), so a phone photo isn't megabytes */
function shrink(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, 2048 / Math.max(img.naturalWidth, img.naturalHeight))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.naturalWidth * scale)
      canvas.height = Math.round(img.naturalHeight * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('Billedet kan ikke læses'))
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(img.src)
      resolve(canvas.toDataURL('image/jpeg', 0.9))
    }
    img.onerror = () => reject(new Error(`${file.name} kan ikke læses`))
    img.src = URL.createObjectURL(file)
  })
}

/** The next whole hour as "YYYY-MM-DDTHH:MM" in the browser's own (Danish) time */
function nextHour() {
  const d = new Date(Date.now() + 3_600_000)
  d.setMinutes(0, 0, 0)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/**
 * Write a post by hand: text, an optional link, 1–10 pictures, the platforms and a time – or
 * out at once. It goes in the same queue as the engine's posts and is posted at its time.
 */
export function OwnPostForm({
  platforms,
  templates,
  leagues,
}: {
  platforms: { id: string; name: string; connected: boolean; story: boolean }[]
  /** The engine's templates: "programme", "results" or "topic:<id>" */
  templates: { value: string; label: string }[]
  leagues: { id: string; name: string }[]
}) {
  const { busy, msg, run } = useAction()
  const tplAction = useAction()
  const [tpl, setTpl] = useState('')
  const [league, setLeague] = useState('')
  const [storyImage, setStoryImage] = useState<string>()
  // The template's ten texts, to step through with "Ny tekst"
  const [captions, setCaptions] = useState<string[]>([])
  const [captionNo, setCaptionNo] = useState(0)
  const [text, setText] = useState('')
  const [link, setLink] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [chosen, setChosen] = useState<string[]>(() => platforms.filter((p) => p.connected).slice(0, 1).map((p) => p.id))
  const [story, setStory] = useState(false)
  const [at, setAt] = useState(nextHour)
  const [reading, setReading] = useState(false)
  const add = async (files: FileList | null) => {
    if (!files?.length) return
    setReading(true)
    try {
      const list = await Promise.all([...files].slice(0, 10 - images.length).map(shrink))
      setImages((x) => [...x, ...list].slice(0, 10))
    } finally {
      setReading(false)
    }
  }
  const submit = async (now: boolean) => {
    if (now && !window.confirm('Udgiv opslaget nu på de valgte platforme?')) return
    const r = await run({ action: 'own', text, link, images, storyImage, platforms: chosen, story, at, now })
    if (!r.error) {
      setText('')
      setLink('')
      setImages([])
      setStory(false)
      setStoryImage(undefined)
      setAt(nextHour())
    }
  }
  // A template's cards (made on the server for the chosen day) and its text as the start of the post
  const applyTemplate = async () => {
    if (!tpl) return
    const [kind, topic] = tpl.split(':')
    const r = await tplAction.run({ action: 'ownTemplate', kind, topic, league, date: at.slice(0, 10) })
    const d = r.data as { images: { file: string; surface: string }[]; caption: string; captions?: string[]; link: string } | undefined
    if (r.error || !d) return
    const feed = d.images.filter((i) => i.surface === 'feed').map((i) => `file:${i.file}`)
    const st = d.images.find((i) => i.surface === 'story')
    setImages((x) => [...feed, ...x.filter((y) => !y.startsWith('file:'))].slice(0, 10))
    setStoryImage(st ? `file:${st.file}` : undefined)
    if (st) setStory(true)
    setCaptions(d.captions ?? [d.caption])
    setCaptionNo(Math.max(0, (d.captions ?? []).indexOf(d.caption)))
    if (!text.trim() || window.confirm('Erstat teksten med skabelonens tekst?')) setText(d.caption)
    if (!link.trim()) setLink(d.link)
  }
  const thumb = (ref: string) => (ref.startsWith('file:') ? `/sociale-billeder/${ref.slice(5)}` : ref)
  // The picture shown large (index in the list, or -1 for the story card)
  const [big, setBig] = useState<number>()
  const shown = big === undefined ? undefined : big === -1 ? storyImage : images[big]
  const canStory = chosen.some((id) => platforms.find((p) => p.id === id)?.story)
  return (
    <div className="own-post">
      <div className="own-post__tpl">
        <label>
          <span>Skabelon (valgfri)</span>
          <select value={tpl} onChange={(e) => setTpl(e.target.value)}>
            <option value="">Ingen – mine egne billeder</option>
            {templates.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Liga</span>
          <select value={league} onChange={(e) => setLeague(e.target.value)} disabled={!tpl}>
            <option value="">Dagens udvalgte</option>
            {leagues.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="pill" disabled={!tpl || tplAction.busy} onClick={() => void applyTemplate()}>
          {tplAction.busy ? 'Laver billeder …' : 'Brug skabelon'}
        </button>
        <Msg msg={tplAction.msg} />
        <small className="muted own-post__tpl-note">Billederne laves til dagen under &quot;Udgiv&quot;. Du kan rette teksten og tilføje egne billeder bagefter.</small>
      </div>
      <label className="own-post__text">
        <span>Tekst</span>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder="Skriv opslaget …" maxLength={5000} />
        <small className="muted">
          {text.length} tegn{text.length > 280 ? ' · X viser kun de første 280' : ''}
          {captions.length > 1 && (
            <>
              {' · '}
              <button
                type="button"
                className="text-btn"
                onClick={() => {
                  const n = (captionNo + 1) % captions.length
                  setCaptionNo(n)
                  setText(captions[n])
                }}
              >
                Ny tekst ↻ ({captionNo + 1}/{captions.length})
              </button>
            </>
          )}
        </small>
      </label>
      <label>
        <span>Link (valgfrit)</span>
        <input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://matchly.dk/…" />
      </label>
      <div className="own-post__images">
        <span>Billeder ({images.length}/10)</span>
        <div className="own-post__thumbs">
          {images.map((src, i) => (
            <figure key={i}>
              <button type="button" className="own-post__open" onClick={() => setBig(i)} aria-label={`Vis billede ${i + 1} stort`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- a local preview of the chosen picture */}
                <img src={thumb(src)} alt="" />
              </button>
              <figcaption>
                {i + 1}/{images.length}
              </figcaption>
              <button type="button" className="own-post__remove" onClick={() => setImages((x) => x.filter((_, j) => j !== i))} aria-label="Fjern billedet">
                ×
              </button>
            </figure>
          ))}
          {images.length < 10 && (
            <label className="own-post__add">
              {reading ? 'Læser …' : '+ Tilføj billeder'}
              <input type="file" accept="image/*" multiple hidden onChange={(e) => void add(e.target.files)} />
            </label>
          )}
        </div>
        {/* A template's story card when stories can't be posted from here: to download and post by hand */}
        {!canStory && storyImage && (
          <p className="small">
            <a className="pill" href={thumb(storyImage)} download="matchly-story.jpg">
              ⬇ Hent story-billedet
            </a>{' '}
            <span className="muted">Stories lægges op i Meta Business Suite (de kan ikke sendes gennem Make).</span>
          </p>
        )}
        {story && storyImage && (
          <div className="own-post__thumbs">
            <figure className="is-story">
              <button type="button" className="own-post__open" onClick={() => setBig(-1)} aria-label="Vis story-billedet stort">
                {/* eslint-disable-next-line @next/next/no-img-element -- the template's story card */}
                <img src={thumb(storyImage)} alt="" />
              </button>
              <figcaption>Story</figcaption>
            </figure>
          </div>
        )}
        {images.length > 0 && <small className="muted">Klik på et billede for at se det i fuld størrelse. Flere billeder bliver en karrusel i den rækkefølge, de står.</small>}
        {shown && (
          <div className="own-post__big" role="dialog" aria-label="Billedet i fuld størrelse" onClick={() => setBig(undefined)}>
            {/* eslint-disable-next-line @next/next/no-img-element -- the picture in full size */}
            <img src={thumb(shown)} alt="" onClick={(e) => e.stopPropagation()} />
            <div className="own-post__big-bar" onClick={(e) => e.stopPropagation()}>
              {big !== -1 && images.length > 1 && (
                <button type="button" className="pill" onClick={() => setBig((b) => ((b ?? 0) - 1 + images.length) % images.length)}>
                  ← Forrige
                </button>
              )}
              <span>{big === -1 ? 'Story' : `${(big ?? 0) + 1} af ${images.length}`}</span>
              {big !== -1 && images.length > 1 && (
                <button type="button" className="pill" onClick={() => setBig((b) => ((b ?? 0) + 1) % images.length)}>
                  Næste →
                </button>
              )}
              <button type="button" className="pill is-active" onClick={() => setBig(undefined)}>
                Luk
              </button>
            </div>
          </div>
        )}
      </div>
      <fieldset className="own-post__platforms">
        <legend>Platforme</legend>
        {platforms.map((p) => (
          <label key={p.id} className="social-check" title={p.connected ? undefined : 'Ikke forbundet – sættes op under Indstillinger'}>
            <input type="checkbox" disabled={!p.connected} checked={chosen.includes(p.id)} onChange={(e) => setChosen((x) => (e.target.checked ? [...x, p.id] : x.filter((y) => y !== p.id)))} /> {p.name}
            {!p.connected && <span className="muted small"> (ikke forbundet)</span>}
          </label>
        ))}
        {canStory && (
          <label className="social-check">
            <input type="checkbox" checked={story} onChange={(e) => setStory(e.target.checked)} /> Også som story (første billede)
          </label>
        )}
      </fieldset>
      <div className="own-post__when">
        <label>
          <span>Udgiv</span>
          <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
        </label>
        <button type="button" className="pill is-active" disabled={busy || reading} onClick={() => void submit(false)}>
          {busy ? 'Gemmer …' : 'Planlæg'}
        </button>
        <button type="button" className="pill" disabled={busy || reading} onClick={() => void submit(true)}>
          Udgiv nu
        </button>
        <Msg msg={msg} />
      </div>
    </div>
  )
}

/** Facebook through Make.com: the scenario's webhook address (kept on the server, shown masked) */
export function MakeConnect({ saved }: { saved?: string }) {
  return (
    <ActionForm submit="Gem webhooken" build={(f) => ({ action: 'make', url: val(f, 'url') })}>
      <Field label="Make-webhook" hint={saved ? `Gemt: ${saved}. Skriv en ny for at skifte den.` : 'Fx https://hook.eu1.make.com/abc123…'}>
        <input name="url" type="url" autoComplete="off" placeholder="https://hook.eu1.make.com/…" />
      </Field>
    </ActionForm>
  )
}
