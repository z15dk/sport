'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

export interface WidgetLeague {
  slug: string
  name: string
  country: string
  clubs: { slug: string; name: string }[]
}

/** /widget: choose a league, a team to highlight and a theme; a live preview and the code to copy */
export function WidgetBuilder({ leagues, site, initial, aside }: { leagues: WidgetLeague[]; site: string; initial?: string; aside?: React.ReactNode }) {
  const [liga, setLiga] = useState(leagues.find((l) => l.slug === initial)?.slug ?? leagues[0]?.slug ?? '')
  const [hold, setHold] = useState('')
  const [tema, setTema] = useState<'lys' | 'mork'>('lys')
  const [kompakt, setKompakt] = useState(false)
  const [copied, setCopied] = useState(false)
  const [height, setHeight] = useState(560)
  const frame = useRef<HTMLIFrameElement>(null)
  const league = leagues.find((l) => l.slug === liga) ?? leagues[0]

  const code = useMemo(() => {
    if (!league) return ''
    const attrs = [`data-liga="${league.slug}"`, hold && `data-hold="${hold}"`, tema === 'mork' && 'data-tema="mork"', kompakt && 'data-kompakt="1"'].filter(Boolean).join(' ')
    return `<div class="matchly-tabel" ${attrs}>\n  <a href="${site}/turnering/${league.slug}">${league.name} stilling</a> · leveret af <a href="${site}">Matchly</a>\n</div>\n<script async src="${site}/widget.js"></script>`
  }, [league, hold, tema, kompakt, site])

  const preview = league ? `/widget/tabel/${league.slug}?${new URLSearchParams({ id: 'preview', ...(hold && { hold }), ...(tema === 'mork' && { tema }), ...(kompakt && { kompakt: '1' }) })}` : ''

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
          <span>Fremhæv hold</span>
          <select value={hold} onChange={(e) => setHold(e.target.value)}>
            <option value="">Intet</option>
            {league.clubs.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <span>Udseende</span>
          <div className="widget-builder__row">
            <label>
              <input type="radio" checked={tema === 'lys'} onChange={() => setTema('lys')} /> Lys
            </label>
            <label>
              <input type="radio" checked={tema === 'mork'} onChange={() => setTema('mork')} /> Mørk
            </label>
            <label>
              <input type="checkbox" checked={kompakt} onChange={(e) => setKompakt(e.target.checked)} /> Kompakt (uden V/U/T)
            </label>
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
        <iframe ref={frame} key={preview} src={preview} title="Forhåndsvisning af tabellen" style={{ height }} />
        <p className="small muted">
          <a href={`/turnering/${league.slug}`}>{league.name} stilling</a> · leveret af <a href="/">Matchly</a>
        </p>
      </section>
      {aside && <aside className="widget-builder__aside">{aside}</aside>}
    </div>
  )
}
