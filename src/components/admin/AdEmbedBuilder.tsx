'use client'

import { useState } from 'react'

// /admin/annonce: the code the sender gives each recipient (a campaign name per
// recipient, so the clicks can be told apart), a live preview of the ad, and the
// address of the ad alone for mails and newsletters.

const slug = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}._-]/gu, '').slice(0, 60)

export function AdEmbedBuilder({ site }: { site: string }) {
  const [campaign, setCampaign] = useState('')
  const [height, setHeight] = useState('')
  const [column, setColumn] = useState(false)
  const [format, setFormat] = useState<'helside' | 'banner'>('helside')
  const banner = format === 'banner'
  const [copied, setCopied] = useState(false)
  const k = slug(campaign)
  const attrs = [banner && 'data-format="banner"', k && `data-kampagne="${k}"`, !banner && Number(height) > 0 && `data-hoejde="${Number(height)}"`, column && 'data-bredde="kolonne"']
    .filter(Boolean)
    .join(' ')
  const code = `<div class="matchly-annonce"${attrs ? ` ${attrs}` : ''}><a href="${site}/">Matchly – live score og stats</a></div>\n<script async src="${site}/annonce.js"></script>`
  const preview = `/annonce/helside?id=preview${banner ? '&format=banner' : ''}${k ? `&kampagne=${encodeURIComponent(k)}` : ''}`
  const link = `${site}/annonce/klik?til=%2F${k ? `&kampagne=${encodeURIComponent(k)}` : ''}`
  return (
    <div className="widget-builder ad-builder">
      <section className="panel widget-builder__form">
        <fieldset>
          <span>Format</span>
          <div className="widget-builder__kinds">
            <button type="button" className={banner ? undefined : 'is-on'} onClick={() => setFormat('helside')}>
              Helside
            </button>
            <button type="button" className={banner ? 'is-on' : undefined} onClick={() => setFormat('banner')}>
              Banner (300 px)
            </button>
          </div>
          <small className="muted">{banner ? 'Et bånd på 300 px til toppen af siden: overskrift, knap og kampene lige nu.' : 'Fylder hele skærmen: overskrift, kampene lige nu og alt det, vi tilbyder.'}</small>
        </fieldset>
        <label>
          <span>Modtager / kampagne</span>
          <input type="text" value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="fx lokalavisen eller fanklub-ob" maxLength={60} />
          <small className="muted">Giv hver modtager sit eget navn, så du kan se, hvor klikkene kommer fra. Siden, annoncen står på, tælles også af sig selv.</small>
        </label>
        <label className="widget-builder__row">
          <input type="checkbox" checked={column} onChange={(e) => setColumn(e.target.checked)} /> Hold annoncen inden i kolonnen (ellers fylder den hele skærmens bredde)
        </label>
        {!banner && (
          <label>
            <span>Højde (tom = hele skærmen)</span>
            <input type="number" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="fx 700" min={360} max={2000} />
          </label>
        )}
        <label>
          <span>Annoncekode til modtageren</span>
          <textarea readOnly value={code} rows={4} onFocus={(e) => e.currentTarget.select()} />
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
        <label>
          <span>Link med tælling (til mails og nyhedsbreve)</span>
          <input type="text" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
          <small className="muted">Klik på linket tælles på samme kampagne og sender videre til forsiden. Klik fra mails har ingen side, så de tælles under modtagerens mailprogram, når det oplyser afsenderen – ellers ikke.</small>
        </label>
      </section>
      <section className="panel widget-builder__preview ad-preview">
        <iframe key={preview} src={preview} title="Forhåndsvisning af annoncen" style={banner ? { height: 300 } : undefined} />
        <p className="muted small">
          Forhåndsvisningen tælles ikke. Annoncen fylder modtagerens skærm i bredden{banner ? ' og er 300 px høj' : ' og højden'}, også når koden står i en smal kolonne, og bliver smallere på mobil.
        </p>
      </section>
    </div>
  )
}
