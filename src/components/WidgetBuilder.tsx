'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

export interface WidgetLeague {
  slug: string
  name: string
  country: string
  clubs: { slug: string; name: string }[]
}

/** /widget: the league table or a club's next matches – league, club, colour and theme; a live preview and the code to copy */
export type WidgetKind = 'tabel' | 'kampe'

export function WidgetBuilder({ leagues, site, initial, initialKind = 'tabel', aside }: { leagues: WidgetLeague[]; site: string; initial?: string; initialKind?: WidgetKind; aside?: React.ReactNode }) {
  const [kind, setKind] = useState<WidgetKind>(initialKind)
  const [antal, setAntal] = useState(5)
  const [seneste, setSeneste] = useState(true)
  const [visTv, setVisTv] = useState(true)
  const [liga, setLiga] = useState(leagues.find((l) => l.slug === initial)?.slug ?? leagues[0]?.slug ?? '')
  const [hold, setHold] = useState('')
  const [tema, setTema] = useState<'lys' | 'mork'>('lys')
  const [farve, setFarve] = useState('c6f135')
  const [kompakt, setKompakt] = useState(false)
  const [copied, setCopied] = useState(false)
  const [height, setHeight] = useState(560)
  const frame = useRef<HTMLIFrameElement>(null)
  const league = leagues.find((l) => l.slug === liga) ?? leagues[0]

  // A club's next matches need a club: the league's first until one is chosen
  const klub = kind === 'kampe' ? hold || league?.clubs[0]?.slug || '' : ''
  const klubName = league?.clubs.find((c) => c.slug === klub)?.name ?? ''
  const showColor = kind === 'kampe' || !!hold

  const code = useMemo(() => {
    if (!league) return ''
    const credit = ' · leveret af <a href="' + site + '">Matchly</a>'
    if (kind === 'kampe') {
      const attrs = [`data-klub="${klub}"`, farve !== 'c6f135' && `data-farve="${farve}"`, antal !== 5 && `data-antal="${antal}"`, !seneste && 'data-seneste="0"', !visTv && 'data-tv="0"', tema === 'mork' && 'data-tema="mork"'].filter(Boolean).join(' ')
      return `<div class="matchly-kampe" ${attrs}>\n  <a href="${site}/klub/${klub}">${klubName} kampprogram</a>${credit}\n</div>\n<script async src="${site}/widget.js"></script>`
    }
    const attrs = [`data-liga="${league.slug}"`, hold && `data-hold="${hold}"`, hold && farve !== 'c6f135' && `data-farve="${farve}"`, tema === 'mork' && 'data-tema="mork"', kompakt && 'data-kompakt="1"'].filter(Boolean).join(' ')
    return `<div class="matchly-tabel" ${attrs}>\n  <a href="${site}/turnering/${league.slug}">${league.name} stilling</a>${credit}\n</div>\n<script async src="${site}/widget.js"></script>`
  }, [kind, league, klub, klubName, hold, farve, antal, seneste, visTv, tema, kompakt, site])

  const preview = !league
    ? ''
    : kind === 'kampe'
      ? `/widget/kampe/${klub}?${new URLSearchParams({ id: 'preview', ...(farve !== 'c6f135' && { farve }), ...(antal !== 5 && { antal: String(antal) }), ...(!seneste && { seneste: '0' }), ...(!visTv && { tv: '0' }), ...(tema === 'mork' && { tema }) })}`
      : `/widget/tabel/${league.slug}?${new URLSearchParams({ id: 'preview', ...(hold && { hold }), ...(hold && farve !== 'c6f135' && { farve }), ...(tema === 'mork' && { tema }), ...(kompakt && { kompakt: '1' }) })}`

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source === frame.current?.contentWindow && e.data?.matchly === 'preview' && e.data.height) setHeight(Math.ceil(e.data.height))
    }
    addEventListener('message', onMessage)
    return () => removeEventListener('message', onMessage)
  }, [])

  if (!league) return <p className="muted">Ingen ligaer med en stilling lige nu.</p>
  return (
    <div className="widget-builder">
      <section className="panel widget-builder__form">
        <div className="widget-builder__kinds" role="tablist">
          {(
            [
              ['tabel', 'Ligatabel'],
              ['kampe', 'Kommende kampe'],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={kind === k} className={kind === k ? 'is-on' : undefined} onClick={() => setKind(k)}>
              {label}
            </button>
          ))}
        </div>
        <label>
          <span>Liga</span>
          <select
            value={league.slug}
            onChange={(e) => {
              setLiga(e.target.value)
              setHold('')
            }}
          >
            {leagues.map((l) => (
              <option key={l.slug} value={l.slug}>
                {l.name} ({l.country})
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{kind === 'kampe' ? 'Klub' : 'Fremhæv hold'}</span>
          <select value={kind === 'kampe' ? klub : hold} onChange={(e) => setHold(e.target.value)}>
            {kind === 'tabel' && <option value="">Intet</option>}
            {league.clubs.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {kind === 'kampe' && (
          <fieldset>
            <span>Kampe</span>
            <div className="widget-builder__row">
              <select value={antal} onChange={(e) => setAntal(Number(e.target.value))} aria-label="Antal kampe">
                {[3, 5, 8, 10].map((n) => (
                  <option key={n} value={n}>
                    {n} kampe
                  </option>
                ))}
              </select>
              <label>
                <input type="checkbox" checked={seneste} onChange={(e) => setSeneste(e.target.checked)} /> Vis seneste resultat
              </label>
              <label>
                <input type="checkbox" checked={visTv} onChange={(e) => setVisTv(e.target.checked)} /> Vis TV-kanal
              </label>
            </div>
          </fieldset>
        )}
        {showColor && (
          <fieldset>
            <span>{kind === 'kampe' ? 'Farve på datoerne' : 'Farve på dit hold'}</span>
            <div className="widget-builder__colors">
              {[{ hex: 'c6f135', label: 'Matchly-grøn' }].map((c) => (
                <button key={c.hex} type="button" className={farve === c.hex ? 'is-on' : undefined} onClick={() => setFarve(c.hex)} title={c.label}>
                  <i style={{ background: `#${c.hex}` }} /> {c.label}
                </button>
              ))}
              <label className={`widget-builder__pick${farve !== 'c6f135' ? ' is-on' : ''}`} title="Vælg selv">
                <input type="color" value={`#${farve}`} onChange={(e) => setFarve(e.target.value.slice(1).toLowerCase())} /> Vælg selv
              </label>
            </div>
          </fieldset>
        )}
        <fieldset>
          <span>Udseende</span>
          <div className="widget-builder__row">
            <label>
              <input type="radio" checked={tema === 'lys'} onChange={() => setTema('lys')} /> Lys
            </label>
            <label>
              <input type="radio" checked={tema === 'mork'} onChange={() => setTema('mork')} /> Mørk
            </label>
            {kind === 'tabel' && (
              <label>
                <input type="checkbox" checked={kompakt} onChange={(e) => setKompakt(e.target.checked)} /> Kompakt (uden V/U/T)
              </label>
            )}
          </div>
        </fieldset>
        <label>
          <span>Kode til din side</span>
          <textarea readOnly value={code} rows={5} onFocus={(e) => e.currentTarget.select()} />
        </label>
        <button
          type="button"
          className="widget-builder__copy"
          onClick={() => {
            navigator.clipboard?.writeText(code).then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            })
          }}
        >
          {copied ? 'Kopieret ✓' : 'Kopiér koden'}
        </button>
      </section>
      <section className="panel widget-builder__preview">
        <iframe ref={frame} key={preview} src={preview} title="Forhåndsvisning" style={{ height }} />
      </section>
      {aside && <aside className="widget-builder__aside">{aside}</aside>}
    </div>
  )
}
