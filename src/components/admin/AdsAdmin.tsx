'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MAX_CREATIVES, creativesOf, type AdBanner, type AdPlacement, type AdPlacementId, type AdSlotConfig, type AdsConfig } from '../../data/ads'

// /admin/reklamer: the ads switch, and per placement an uploaded banner (computer and
// phone) with a link, or an ad network's code, or off; the code for every page's
// head and the text for /ads.txt.

const WHERE: Record<AdPlacementId, string> = {
  top: 'Under topbjælken på alle sider',
  feed: 'Mellem ligaerne på forsiden og inde i indholdet på liga- og turneringssider',
  side: 'Højre kolonne på forsiden (følger med ned). Vises ikke på mobil',
  content: 'På kamp-, klub-, liga-, spiller- og artikelsider',
  scroll:
    'En hel skærm midt i siden, som man scroller forbi – billedet står stille, mens siden glider hen over det. Kun på forsiden, efter 5. liga. Motivet i midten: kanterne skæres af efter skærmens format',
}

type Msg = { text: string; error?: boolean }

async function post(body: FormData | Record<string, unknown>): Promise<AdsConfig> {
  const res = await fetch('/api/admin/ads', {
    method: 'POST',
    ...(body instanceof FormData ? { body } : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  })
  const r = (await res.json().catch(() => ({}))) as { ads?: AdsConfig; error?: string }
  if (res.status === 413) throw new Error('Billedet er for stort til serveren – prøv et mindre billede')
  if (res.status === 401) throw new Error('Du er logget ud – log ind igen og prøv igen')
  if (!res.ok || !r.ads) throw new Error(r.error ?? `Det gik ikke (fejl ${res.status})`)
  return r.ads
}

export function AdsAdmin({ config, placements, enabled }: { config: AdsConfig; placements: AdPlacement[]; enabled: boolean }) {
  const router = useRouter()
  const [ads, setAds] = useState(config)
  const [on, setOn] = useState(enabled)
  const [msg, setMsg] = useState<Msg>()
  const [head, setHead] = useState(config.head ?? '')
  const [adsTxt, setAdsTxt] = useState(config.adsTxt ?? '')

  async function run(job: () => Promise<AdsConfig | void>, done: string) {
    setMsg(undefined)
    try {
      const next = await job()
      if (next) setAds(next)
      setMsg({ text: done })
      router.refresh()
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : String(e), error: true })
    }
  }

  async function toggle() {
    await run(async () => {
      const res = await fetch('/api/admin/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: 'ads', value: !on }) })
      if (!res.ok) throw new Error(`Det gik ikke (fejl ${res.status})`)
      setOn(!on)
    }, on ? 'Reklamerne er slået fra' : 'Reklamerne er slået til')
  }

  return (
    <div className="ads-admin">
      <section className={`panel ads-admin__switch${on ? ' is-on' : ''}`}>
        <div>
          <strong>Reklamer på siden er {on ? 'slået til' : 'slået fra'}</strong>
          <p className="muted small">
            {on
              ? 'Pladserne vises med din annonce eller kode og mærkes "Annonce". Pladser uden annonce vises slet ikke.'
              : 'Ingen reklamer vises nogen steder. Du kan godt lægge annoncer ind først og slå til bagefter.'}
          </p>
        </div>
        <button type="button" className={`pill${on ? '' : ' is-active'}`} onClick={toggle}>
          {on ? 'Slå fra' : 'Slå til'}
        </button>
      </section>

      {msg && (
        <p className={`social-msg${msg.error ? ' is-error' : ''}`} role="status">
          {msg.text}
        </p>
      )}

      {placements.map((p) => (
        <SlotEditor key={p.id} p={p} slot={ads.slots[p.id]} run={run} />
      ))}

      <section className="panel">
        <h2 className="panel__title">Kode på alle sider (head)</h2>
        <p className="muted small pad">
          Annoncenetværkets hovedscript, fx Google AdSense: <code>&lt;script async src=&quot;https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-…&quot; crossorigin=&quot;anonymous&quot;&gt;&lt;/script&gt;</code>. Indlæses én gang på hver side, når reklamerne er slået til. Sæt kun kode ind fra netværk, du stoler på – den kører på hele siden.
        </p>
        <form
          className="ads-admin__form"
          onSubmit={(e) => {
            e.preventDefault()
            run(() => post({ head }), 'Koden er gemt – den virker på siden inden for ca. 15 sek.')
          }}
        >
          <textarea rows={4} value={head} onChange={(e) => setHead(e.target.value)} spellCheck={false} placeholder="<script …></script>" />
          <div>
            <button type="submit" className="pill is-active">
              Gem koden
            </button>
          </div>
        </form>
      </section>

      <section className="panel">
        <h2 className="panel__title">ads.txt</h2>
        <p className="muted small pad">
          Annoncenetværk kræver en fil på <a href="/ads.txt" target="_blank" rel="noreferrer">matchly.dk/ads.txt</a> med deres linje, fx <code>google.com, pub-0000000000000000, DIRECT, f08c47fec0942fa0</code>. Netværket giver dig teksten.
        </p>
        <form
          className="ads-admin__form"
          onSubmit={(e) => {
            e.preventDefault()
            run(() => post({ adsTxt }), 'ads.txt er gemt')
          }}
        >
          <textarea rows={4} value={adsTxt} onChange={(e) => setAdsTxt(e.target.value)} spellCheck={false} placeholder="google.com, pub-…, DIRECT, f08c47fec0942fa0" />
          <div>
            <button type="submit" className="pill is-active">
              Gem ads.txt
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

function SlotEditor({ p, slot, run }: { p: AdPlacement; slot?: AdSlotConfig; run: (job: () => Promise<AdsConfig | void>, done: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const off = slot?.mode === 'off'
  const more = slot?.more ?? []
  const [adding, setAdding] = useState(false)
  const count = 1 + more.length + (adding ? 1 : 0)
  const shown = creativesOf(slot).length
  const firstKind: 'image' | 'code' = slot?.mode === 'code' ? 'code' : 'image'

  const status = off ? 'Slået fra' : shown > 1 ? `${shown} annoncer på skift` : shown === 1 ? (firstKind === 'code' && creativesOf(slot)[0].kind === 'code' ? 'Annoncekode' : 'Dit banner') : 'Tom – vises ikke'

  async function setOff(value: boolean) {
    setBusy(true)
    await run(() => post({ slot: p.id, mode: value ? 'off' : firstOn(slot) }), value ? `${p.name} er slået fra` : `${p.name} er slået til`)
    setBusy(false)
  }

  const size = (v: 'desktop' | 'mobile') => `${p[v].width} × ${p[v].height}`

  return (
    <section className="panel ads-admin__slot">
      <div className="ads-admin__head">
        <div>
          <h2 className="panel__title">
            {p.name} <span className="muted small">· {size('desktop')} / mobil {p.id === 'side' ? '–' : size('mobile')}</span>
          </h2>
          <p className="muted small">{WHERE[p.id]}</p>
        </div>
        <span className={`ads-admin__status is-${status === 'Tom – vises ikke' ? 'empty' : status === 'Slået fra' ? 'off' : 'on'}`}>{status}</span>
      </div>
      <div className="ads-admin__modes" role="radiogroup" aria-label={`${p.name} til eller fra`}>
        <button type="button" role="radio" aria-checked={!off} className={`pill${!off ? ' is-active' : ''}`} disabled={busy} onClick={() => off && setOff(false)}>
          Vises
        </button>
        <button type="button" role="radio" aria-checked={off} className={`pill${off ? ' is-active' : ''}`} disabled={busy} onClick={() => !off && setOff(true)}>
          Slået fra
        </button>
      </div>

      {off ? (
        <div className="ads-admin__body">
          <p className="muted small">Pladsen vises slet ikke. Annoncerne er gemt og kommer igen, når den slås til.</p>
        </div>
      ) : (
        <div className="ads-admin__body">
          <p className="muted small">
            Op til {MAX_CREATIVES} annoncer (fx én pr. kunde), der skiftes ved hvert besøg: en besøgende ser den samme annonce på alle sider under besøget, og næste besøg viser den næste. Så får kunderne lige mange besøgende hver. Hver annonce er et billede eller en annoncekode.
          </p>
          {Array.from({ length: count }, (_, n) => (
            <BannerEditor
              key={`${n}-${n === 0 ? firstKind : (more[n - 1]?.kind ?? 'ny')}-${n === 0 ? '' : (more[n - 1]?.desktop ?? more[n - 1]?.code?.length ?? 'ny')}`}
              p={p}
              n={n}
              numbered={count > 1}
              banner={n === 0 ? (slot ? { ...slot, kind: firstKind } : undefined) : more[n - 1]}
              run={run}
              onDone={() => setAdding(false)}
            />
          ))}
          {count < MAX_CREATIVES && !adding && shown > 0 && (
            <div>
              <button type="button" className="pill" onClick={() => setAdding(true)}>
                + Tilføj annonce {count + 1}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

/** The mode a placement gets when it is switched on again: its first banner's kind */
function firstOn(slot?: AdSlotConfig): 'image' | 'code' {
  return slot?.code && !slot.desktop ? 'code' : 'image'
}

/** One advertiser's banner on a placement: a picture (computer and phone, link, advertiser, gambling mark) or an ad network's code (n: 0 = the first, 1–3 the ones shown in turn after it) */
function BannerEditor({ p, n, numbered, banner, run, onDone }: { p: AdPlacement; n: number; numbered: boolean; banner?: AdBanner; run: (job: () => Promise<AdsConfig | void>, done: string) => Promise<void>; onDone: () => void }) {
  const [kind, setKind] = useState<'image' | 'code'>(banner?.kind ?? 'image')
  const [href, setHref] = useState(banner?.href ?? '')
  const [alt, setAlt] = useState(banner?.alt ?? '')
  const [gambling, setGambling] = useState(!!banner?.gambling)
  const [code, setCode] = useState(banner?.code ?? '')
  const [busy, setBusy] = useState(false)
  const label = numbered ? `Annonce ${n + 1}` : ''

  async function upload(variant: 'desktop' | 'mobile', file?: File) {
    if (!file) return
    setBusy(true)
    const form = new FormData()
    form.set('file', file)
    form.set('slot', p.id)
    form.set('variant', variant)
    form.set('creative', String(n))
    await run(() => post(form), `${label || 'Banneret'}${variant === 'mobile' ? ' (mobil)' : ''} er lagt op`)
    setBusy(false)
    onDone()
  }

  async function save() {
    setBusy(true)
    await run(() => post({ slot: p.id, creative: n, kind, ...(n === 0 ? { mode: kind } : {}), href, alt, gambling, code }), `${label || p.name} er gemt`)
    setBusy(false)
    onDone()
  }

  const size = (v: 'desktop' | 'mobile') => `${p[v].width} × ${p[v].height}`
  const pictureBox = (v: 'desktop' | 'mobile', src?: string) => (
    <div className="ads-admin__pic">
      <span className="small">
        <strong>{v === 'desktop' ? 'Computer' : 'Mobil'}</strong>{v === 'mobile' && p.mobileBelow ? ` (under ${p.mobileBelow + 1} px)` : ''} · {size(v)} px{' '}
        {p.id !== 'scroll' && <span className="muted">(gerne {p[v].width * 2} × {p[v].height * 2})</span>}
      </span>
      <div className="ads-admin__frame" style={{ aspectRatio: `${p[v].width} / ${p[v].height}`, maxWidth: Math.min(p[v].width, 520, Math.round((300 * p[v].width) / p[v].height)) }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- the uploaded banner as it is */}
        {src ? <img src={src} alt="" /> : <span className="muted small">{v === 'mobile' ? 'Intet – computerens banner bruges' : 'Intet banner'}</span>}
      </div>
      <div className="ads-admin__row">
        <input type="file" accept="image/*" disabled={busy} onChange={(e) => upload(v, e.target.files?.[0] ?? undefined).then(() => (e.target.value = ''))} aria-label={`${label || 'Banner'} til ${v === 'desktop' ? 'computer' : 'mobil'}`} />
        {src && (
          <button type="button" className="pill" disabled={busy} onClick={() => run(() => post({ slot: p.id, creative: n, [v]: null }), 'Billedet er fjernet')}>
            Fjern
          </button>
        )}
      </div>
    </div>
  )

  return (
    <div className={numbered ? 'ads-admin__banner' : undefined}>
      <div className="ads-admin__banner-head">
        {numbered && <strong>{label}</strong>}
        <div className="ads-admin__modes" role="radiogroup" aria-label={`${label || 'Annoncen'}: billede eller kode`}>
          {(
            [
              ['image', 'Billede'],
              ['code', 'Annoncekode'],
            ] as const
          ).map(([k, text]) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} className={`pill${kind === k ? ' is-active' : ''}`} onClick={() => setKind(k)}>
              {text}
            </button>
          ))}
        </div>
        {n > 0 && banner && (
          <button type="button" className="pill" disabled={busy} onClick={() => run(() => post({ slot: p.id, removeCreative: n }), `${label} er fjernet`)}>
            Fjern annonce
          </button>
        )}
      </div>
      {kind === 'image' ? (
        <>
          <div className="ads-admin__pics">
            {pictureBox('desktop', banner?.desktop)}
            {p.id !== 'side' && pictureBox('mobile', banner?.mobile)}
          </div>
          <div className="ads-admin__form">
            <label>
              Link (hvor banneret fører hen)
              <input value={href} onChange={(e) => setHref(e.target.value)} placeholder="https://annoncør.dk" inputMode="url" />
            </label>
            <label>
              Annoncør (tekst til skærmlæsere)
              <input value={alt} maxLength={120} onChange={(e) => setAlt(e.target.value)} placeholder="Annoncørens navn" />
            </label>
            <label className="ads-admin__check">
              <input type="checkbox" checked={gambling} onChange={(e) => setGambling(e.target.checked)} /> Spilreklame (viser &quot;18+ · Spil ansvarligt · StopSpillet.dk&quot; under)
            </label>
            <div>
              <button type="button" className="pill is-active" disabled={busy} onClick={save}>
                Gem
              </button>
            </div>
          </div>
          <p className="muted small">JPG, PNG, WebP eller animeret GIF, max 10 MB. Billedet fylder hele pladsen og beskæres, hvis formatet ikke passer.</p>
        </>
      ) : (
        <div className="ads-admin__form">
          <label>
            Annoncekode (HTML/script fra kunden eller netværket, fx en AdSense-annonceenhed)
            <textarea rows={6} value={code} onChange={(e) => setCode(e.target.value)} spellCheck={false} placeholder={'<ins class="adsbygoogle" …></ins>\n<script>(adsbygoogle = window.adsbygoogle || []).push({});</script>'} />
          </label>
          <label className="ads-admin__check">
            <input type="checkbox" checked={gambling} onChange={(e) => setGambling(e.target.checked)} /> Spilreklame (viser &quot;18+ · Spil ansvarligt · StopSpillet.dk&quot; under)
          </label>
          <p className="muted small">Koden får pladsen {size('desktop')} px (mobil {size('mobile')}) og køres kun hos de besøgende, der får denne annonce. Netværkets hovedscript sættes ind nederst under &quot;Kode på alle sider&quot;.</p>
          <p className="muted small">
            Forskellige varer i hvert banner: skriv <code>{'{nr}'}</code> i koden, hvor annoncøren tager et nummer for, hvilken vare der vises. Hvert banner på siden får sit eget nummer (topbanneret 0, bannerne ned gennem kamplisten 1, 2, 3 …); <code>{'{nr:6}'}</code> holder numrene
            mellem 0 og 5 og begynder forfra efter seks. Eksempel: <code>…/728x90.png?p={'{nr:6}'}</code> og det samme nummer i linket (<code>…/klik?p={'{nr:6}'}</code>).
          </p>
          <div>
            <button type="button" className="pill is-active" disabled={busy} onClick={save}>
              Gem
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
